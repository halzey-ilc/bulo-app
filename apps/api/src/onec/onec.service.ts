import { Injectable, NotFoundException } from '@nestjs/common';
import { OneCDocStatus, OneCDocType } from '@prisma/client';
import { isIsoDate } from '../common/dates';
import { ExcelService, ExcelSheet } from '../common/excel.service';
import { PrismaService } from '../common/prisma.service';
import type { CounterpartiesDto, NomenclatureDto, PricesImportDto, PriceTypesDto } from './onec.dto';

/** Документы в очереди, которые повторяем не бесконечно. */
const MAX_ATTEMPTS = 10;

const DOC_LABELS: Record<OneCDocType, string> = {
  CUSTOMER_ORDER: 'Заказ клиента',
  PRODUCTION: 'Заказ на производство',
  SALE: 'Реализация товаров и услуг',
};

interface OrderPayload {
  orderNumber: number;
  deliveryDate: string;
  counterparty: { oneCId: string | null; name: string; inn: string | null };
  deliveryAddress: string;
  items: { productOneCId: string | null; name: string; unit: string; qty: number; price: number; sum: number }[];
  total: number;
}

interface ProductionPayload {
  sheetNumber: number;
  date: string;
  isSupplement: boolean;
  items: { productOneCId: string | null; name: string; unit: string; qty: number }[];
}

/**
 * Обмен с 1С.
 * Входящие (1С → BULO): номенклатура, типы цен, цены, контрагенты — 1С присылает по расписанию.
 * Исходящие (BULO → 1С): очередь документов, которую 1С забирает и подтверждает, либо Excel-выгрузка.
 */
@Injectable()
export class OneCService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

  private async log(direction: 'IN' | 'OUT', entity: string, ok: boolean, count: number, message?: string) {
    await this.prisma.oneCSyncLog.create({ data: { direction, entity, ok, count, message } });
  }

  private async run<T>(entity: string, count: number, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      await this.log('IN', entity, true, count);
      return result;
    } catch (e) {
      await this.log('IN', entity, false, count, (e as Error).message);
      throw e;
    }
  }

  importNomenclature(dto: NomenclatureDto) {
    return this.run('nomenclature', dto.items.length, async () => {
      const groupIds = new Map<string, string>();
      for (const g of dto.groups) {
        const c = await this.prisma.category.upsert({
          where: { oneCId: g.id },
          create: { oneCId: g.id, name: g.name },
          update: { name: g.name },
        });
        groupIds.set(g.id, c.id);
      }
      let created = 0;
      for (const i of dto.items) {
        const categoryId =
          groupIds.get(i.groupId) ??
          (await this.prisma.category.findUnique({ where: { oneCId: i.groupId } }))?.id;
        if (!categoryId) throw new Error(`Группа ${i.groupId} не найдена для товара ${i.id}`);
        const fields = {
          name: i.name,
          categoryId,
          unit: i.unit ?? 'шт',
          multiplicity: i.multiplicity ?? 1,
          weight: i.weight,
          shelfLife: i.shelfLife,
        };
        const existing = await this.prisma.product.findUnique({ where: { oneCId: i.id } });
        if (existing) {
          // описание и фото ведутся в BULO — из 1С берём только если своего нет
          await this.prisma.product.update({
            where: { id: existing.id },
            data: { ...fields, description: existing.description ?? i.description },
          });
        } else {
          await this.prisma.product.create({ data: { ...fields, oneCId: i.id, description: i.description } });
          created++;
        }
      }
      return { groups: dto.groups.length, items: dto.items.length, created };
    });
  }

  importPriceTypes(dto: PriceTypesDto) {
    return this.run('price-types', dto.items.length, async () => {
      for (const t of dto.items) {
        if (t.isDefault) await this.prisma.priceType.updateMany({ data: { isDefault: false } });
        await this.prisma.priceType.upsert({
          where: { oneCId: t.id },
          create: { oneCId: t.id, name: t.name, isDefault: t.isDefault ?? false },
          update: { name: t.name, isDefault: t.isDefault ?? undefined },
        });
      }
      return { items: dto.items.length };
    });
  }

  importPrices(dto: PricesImportDto) {
    return this.run('prices', dto.items.length, async () => {
      const [products, types] = await Promise.all([
        this.prisma.product.findMany({ where: { oneCId: { not: null } }, select: { id: true, oneCId: true } }),
        this.prisma.priceType.findMany({ where: { oneCId: { not: null } }, select: { id: true, oneCId: true } }),
      ]);
      const pid = new Map(products.map((p) => [p.oneCId!, p.id]));
      const tid = new Map(types.map((t) => [t.oneCId!, t.id]));
      const skipped: string[] = [];
      for (const i of dto.items) {
        const productId = pid.get(i.productId);
        const priceTypeId = tid.get(i.priceTypeId);
        if (!productId || !priceTypeId) {
          skipped.push(`${i.productId}/${i.priceTypeId}`);
          continue;
        }
        await this.prisma.price.upsert({
          where: { productId_priceTypeId: { productId, priceTypeId } },
          create: { productId, priceTypeId, price: i.price },
          update: { price: i.price },
        });
      }
      return { items: dto.items.length, skipped };
    });
  }

  importCounterparties(dto: CounterpartiesDto) {
    return this.run('counterparties', dto.items.length, async () => {
      for (const c of dto.items) {
        await this.prisma.oneCCounterparty.upsert({
          where: { oneCId: c.id },
          create: { oneCId: c.id, name: c.name, inn: c.inn, address: c.address, phone: c.phone },
          update: { name: c.name, inn: c.inn, address: c.address, phone: c.phone },
        });
      }
      return { items: dto.items.length };
    });
  }

  /** Документы, которые 1С должна забрать. */
  async outbox(limit = 50) {
    const docs = await this.prisma.oneCDocument.findMany({
      where: { status: { in: ['PENDING', 'ERROR'] }, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 200),
    });
    return docs.map((d) => ({ id: d.id, type: d.type, createdAt: d.createdAt, attempts: d.attempts, payload: d.payload }));
  }

  async ack(id: string, ok: boolean, number?: string, error?: string) {
    const doc = await this.prisma.oneCDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Документ не найден');
    const updated = await this.prisma.oneCDocument.update({
      where: { id },
      data: ok
        ? { status: 'SENT', sentAt: new Date(), oneCNumber: number, lastError: null, attempts: { increment: 1 } }
        : { status: 'ERROR', lastError: error ?? 'Ошибка без описания', attempts: { increment: 1 } },
    });
    await this.log('OUT', doc.type, ok, 1, ok ? `№${number ?? '—'}` : error);
    return updated;
  }

  // ---------- для веб-панели ----------

  documents(status?: OneCDocStatus, type?: OneCDocType) {
    return this.prisma.oneCDocument.findMany({
      where: { status, type },
      include: {
        order: { select: { id: true, number: true, partner: { select: { name: true } } } },
        productionSheet: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  retry(id: string) {
    return this.prisma.oneCDocument.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, lastError: null },
    });
  }

  syncLog() {
    return this.prisma.oneCSyncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async status() {
    const [pending, errors, sent, lastIn, lastOut] = await Promise.all([
      this.prisma.oneCDocument.count({ where: { status: 'PENDING' } }),
      this.prisma.oneCDocument.count({ where: { status: 'ERROR' } }),
      this.prisma.oneCDocument.count({ where: { status: 'SENT' } }),
      this.prisma.oneCSyncLog.findFirst({ where: { direction: 'IN' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.oneCSyncLog.findFirst({ where: { direction: 'OUT' }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { pending, errors, sent, lastIn, lastOut, apiKeyConfigured: !!process.env.ONEC_API_KEY };
  }

  counterparties(search?: string) {
    return this.prisma.oneCCounterparty.findMany({
      where: search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { inn: { contains: search } }] }
        : undefined,
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  /**
   * Excel-выгрузка документов для ручной загрузки в 1С.
   * markSent=true — отметить выгруженные документы как переданные, чтобы не выгрузить их дважды.
   */
  async exportXlsx(opts: { from?: string; to?: string; type?: OneCDocType; onlyPending?: boolean; markSent?: boolean }) {
    const docs = await this.prisma.oneCDocument.findMany({
      where: {
        type: opts.type,
        status: opts.onlyPending ? { in: ['PENDING', 'ERROR'] } : undefined,
        createdAt: {
          gte: opts.from && isIsoDate(opts.from) ? new Date(`${opts.from}T00:00:00`) : undefined,
          lte: opts.to && isIsoDate(opts.to) ? new Date(`${opts.to}T23:59:59`) : undefined,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const orderRows = docs
      .filter((d) => d.type !== 'PRODUCTION')
      .flatMap((d) => {
        const p = d.payload as unknown as OrderPayload;
        return p.items.map((i) => ({
          doc: DOC_LABELS[d.type],
          number: p.orderNumber,
          date: p.deliveryDate,
          cpCode: p.counterparty.oneCId ?? '',
          cpName: p.counterparty.name,
          inn: p.counterparty.inn ?? '',
          address: p.deliveryAddress,
          code: i.productOneCId ?? '',
          name: i.name,
          unit: i.unit,
          qty: i.qty,
          price: i.price,
          sum: i.sum,
        }));
      });
    const productionRows = docs
      .filter((d) => d.type === 'PRODUCTION')
      .flatMap((d) => {
        const p = d.payload as unknown as ProductionPayload;
        return p.items.map((i) => ({
          number: p.sheetNumber,
          date: p.date,
          supplement: p.isSupplement ? 'да' : '',
          code: i.productOneCId ?? '',
          name: i.name,
          unit: i.unit,
          qty: i.qty,
        }));
      });

    const sheets: ExcelSheet[] = [
      {
        name: 'Заказы и реализации',
        heading: ['Документы BULO для загрузки в 1С'],
        columns: [
          { header: 'Документ', key: 'doc', width: 26 },
          { header: '№ BULO', key: 'number', width: 9 },
          { header: 'Дата', key: 'date', width: 12 },
          { header: 'Код контрагента 1С', key: 'cpCode', width: 18 },
          { header: 'Контрагент', key: 'cpName', width: 28 },
          { header: 'ИНН', key: 'inn', width: 16 },
          { header: 'Адрес доставки', key: 'address', width: 30 },
          { header: 'Код номенклатуры 1С', key: 'code', width: 18 },
          { header: 'Номенклатура', key: 'name', width: 30 },
          { header: 'Ед.', key: 'unit', width: 8 },
          { header: 'Кол-во', key: 'qty', width: 10, kind: 'qty' },
          { header: 'Цена', key: 'price', width: 12, kind: 'money' },
          { header: 'Сумма', key: 'sum', width: 14, kind: 'money' },
        ],
        rows: orderRows,
      },
      {
        name: 'Производство',
        heading: ['Заказы на производство (сводные накладные)'],
        columns: [
          { header: '№ накладной', key: 'number', width: 12 },
          { header: 'Дата', key: 'date', width: 12 },
          { header: 'Дозаказ', key: 'supplement', width: 10 },
          { header: 'Код номенклатуры 1С', key: 'code', width: 18 },
          { header: 'Номенклатура', key: 'name', width: 30 },
          { header: 'Ед.', key: 'unit', width: 8 },
          { header: 'Кол-во', key: 'qty', width: 12, kind: 'qty' },
        ],
        rows: productionRows,
      },
    ];
    const buffer = await this.excel.build(sheets);

    if (opts.markSent && docs.length) {
      await this.prisma.oneCDocument.updateMany({
        where: { id: { in: docs.map((d) => d.id) }, status: { not: 'SENT' } },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      await this.log('OUT', 'excel-export', true, docs.length, 'Выгрузка в Excel');
    }
    const suffix = opts.from || opts.to ? `${opts.from ?? ''}_${opts.to ?? ''}` : new Date().toISOString().slice(0, 10);
    return { filename: `bulo-1c-${suffix}.xlsx`, buffer };
  }
}
