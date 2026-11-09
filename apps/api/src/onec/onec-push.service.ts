import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { NomenclatureDto, PricesImportDto, StockImportDto } from './onec.dto';
import { OneCService } from './onec.service';

const MAX_ATTEMPTS = 10;

/**
 * Активный обмен с 1С «Ярос»: мы сами отправляем документы и забираем остатки по HTTP-сервису 1С.
 * Включается, когда в .env заданы ONEC_URL, ONEC_LOGIN и ONEC_PASSWORD (их даёт Ярос).
 * Пути можно поменять под их публикацию: ONEC_DOCS_PATH, ONEC_STOCK_PATH, ONEC_NOMENCLATURE_PATH, ONEC_PRICES_PATH.
 * Без этих настроек работает старый режим: 1С сама забирает /api/onec/outbox и присылает остатки.
 */
@Injectable()
export class OneCPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('1C');
  private timers: NodeJS.Timeout[] = [];
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly onec: OneCService,
  ) {}

  private get base() {
    return (process.env.ONEC_URL ?? '').replace(/\/+$/, '');
  }

  get configured() {
    return !!(this.base && process.env.ONEC_LOGIN);
  }

  onModuleInit() {
    if (!this.configured || process.env.NODE_ENV === 'test') return;
    this.logger.log(`Обмен с 1С включён: ${this.base}`);
    const every = (ms: number, fn: () => Promise<unknown>) =>
      this.timers.push(setInterval(() => void fn().catch((e) => this.logger.warn((e as Error).message)), ms));
    every(15_000, () => this.pushDocuments());
    every(2 * 60_000, () => this.pullStock());
    every(30 * 60_000, () => this.pullCatalog());
    setTimeout(() => void this.syncNow().catch(() => undefined), 5_000);
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${process.env.ONEC_LOGIN}:${process.env.ONEC_PASSWORD ?? ''}`).toString('base64');
    const res = await fetch(this.base + path, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`1С ответила ${res.status}: ${text.slice(0, 200)}`);
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      return {} as T;
    }
  }

  /** Отправляет документы из очереди по одному, по порядку. Ошибка не останавливает очередь навсегда — повторим. */
  async pushDocuments() {
    if (!this.configured || this.busy) return { sent: 0, failed: 0 };
    this.busy = true;
    let sent = 0;
    let failed = 0;
    try {
      const docs = await this.prisma.oneCDocument.findMany({
        where: { status: { in: ['PENDING', 'ERROR'] }, attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: 'asc' },
        take: 30,
      });
      // если документ по заказу не прошёл, следующие по тому же заказу (реализацию, отмену) не шлём —
      // иначе 1С получит реализацию заказа, которого у неё нет
      const blocked = new Set<string>();
      for (const d of docs) {
        if (d.orderId && blocked.has(d.orderId)) continue;
        try {
          const r = await this.call<{ number?: string; ok?: boolean; error?: string }>(
            'POST',
            process.env.ONEC_DOCS_PATH ?? '/documents',
            { id: d.id, type: d.type, createdAt: d.createdAt, payload: d.payload },
          );
          if (r.ok === false) throw new Error(r.error ?? '1С не приняла документ');
          await this.onec.ack(d.id, true, r.number);
          sent++;
        } catch (e) {
          await this.onec.ack(d.id, false, undefined, (e as Error).message);
          if (d.orderId) blocked.add(d.orderId);
          failed++;
        }
      }
    } finally {
      this.busy = false;
    }
    return { sent, failed };
  }

  /** Остатки по складам: GET → { items: [{ productId, warehouseId, qty }] } */
  async pullStock() {
    if (!this.configured) return null;
    const dto = await this.call<StockImportDto>('GET', process.env.ONEC_STOCK_PATH ?? '/stock');
    if (!Array.isArray(dto.items)) return null;
    return this.onec.importStock(dto);
  }

  /** Номенклатура и цены (если Ярос их публикует). */
  async pullCatalog() {
    if (!this.configured) return null;
    const out: Record<string, unknown> = {};
    const nPath = process.env.ONEC_NOMENCLATURE_PATH ?? '/nomenclature';
    const pPath = process.env.ONEC_PRICES_PATH ?? '/prices';
    try {
      const n = await this.call<NomenclatureDto>('GET', nPath);
      if (Array.isArray(n.items) && Array.isArray(n.groups)) out.nomenclature = await this.onec.importNomenclature(n);
    } catch (e) {
      out.nomenclature = (e as Error).message;
    }
    try {
      const p = await this.call<PricesImportDto>('GET', pPath);
      if (Array.isArray(p.items)) out.prices = await this.onec.importPrices(p);
    } catch (e) {
      out.prices = (e as Error).message;
    }
    return out;
  }

  async syncNow() {
    if (!this.configured) {
      return { configured: false, message: 'Адрес и логин 1С ещё не заданы (ONEC_URL, ONEC_LOGIN, ONEC_PASSWORD)' };
    }
    const docs = await this.pushDocuments();
    let stock: unknown = null;
    try {
      stock = await this.pullStock();
    } catch (e) {
      stock = (e as Error).message;
    }
    return { configured: true, docs, stock };
  }
}
