/**
 * Офисный API: пульт, партнёры, пользователи и роли, каталог, настройки, отчёты, 1С.
 * Типы ответов описаны здесь же — они нужны только офисным экранам.
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, API_URL, ApiError, getToken, request } from './client';
import type { Order, User } from './types';
import type { OrderStatus, PartnerStatus, Role } from '../shared';

const qs = (o: Record<string, string | number | undefined | null | false>) => {
  const p = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

/* ───────── Типы ───────── */

export interface Dashboard {
  today: string;
  newOrders: number;
  awaitingPayment: { count: number; total: number };
  paid: number;
  inProduction: number;
  ready: number;
  pendingPartners: number;
  todayDeliveries: { count: number; total: number };
  onecErrors: number;
}

export interface PriceType {
  id: string;
  name: string;
  isDefault: boolean;
  oneCId: string | null;
  _count?: { partners: number };
}

export interface PartnerAddress {
  id: string;
  address: string;
  label: string | null;
  isDefault: boolean;
}

export interface AdminPartner {
  id: string;
  name: string;
  inn: string | null;
  contactName: string;
  phone: string;
  email: string | null;
  status: PartnerStatus;
  rejectReason: string | null;
  priceTypeId: string | null;
  priceType: PriceType | null;
  oneCId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  addresses: PartnerAddress[];
  _count?: { orders: number; users: number };
}

export interface AdminUser {
  id: string;
  phone: string | null;
  login: string | null;
  name: string;
  email: string | null;
  role: Role;
  status: 'ACTIVE' | 'BLOCKED';
  accessExpiresAt: string | null;
  canOrder: boolean;
  partnerId: string | null;
  partner: { id: string; name: string; status: PartnerStatus } | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Counterparty {
  oneCId: string;
  name: string;
  inn: string | null;
  address: string | null;
  phone: string | null;
}

export interface PartnerOrderBrief {
  id: string;
  number: number;
  status: OrderStatus;
  deliveryDate: string;
  deliveryAddress: string;
  total: number;
  createdAt: string;
  paidAt: string | null;
}

export interface PartnerDetail extends AdminPartner {
  users: AdminUser[];
  orders: PartnerOrderBrief[];
  counterparty: Counterparty | null;
}

export interface AdminCategory {
  id: string;
  name: string;
  workshopArea: string | null;
  sortOrder: number;
  visible?: boolean;
  imageUrl: string | null;
  _count?: { products: number };
}

export interface AdminPrice {
  productId: string;
  priceTypeId: string;
  price: number;
  priceType: PriceType;
}

export interface AdminProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  composition: string | null;
  weight: string | null;
  shelfLife: string | null;
  unit: string;
  multiplicity: number;
  photoUrl: string | null;
  visible: boolean;
  isNew: boolean;
  sortOrder: number;
  oneCId: string | null;
  category: AdminCategory;
  prices: AdminPrice[];
}

export interface Settings {
  cutoffTime: string;
  minOrderSum: number;
  companyName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  workHours: string | null;
  instagram: string | null;
  whatsapp: string | null;
  telegram: string | null;
}

export interface SalesReport {
  from: string;
  to: string;
  totals: { orders: number; total: number; paid: number; unpaid: number };
  byPartner: { partnerId: string; name: string; orders: number; total: number; paid: number; debt: number }[];
  byProduct: { productId: string; name: string; unit: string; qty: number; total: number }[];
  byDay: { date: string; orders: number; total: number }[];
}

export interface DebtRow {
  orderId: string;
  number: number;
  partnerId: string;
  partner: string;
  phone: string | null;
  deliveryDate: string;
  total: number;
}

export interface SyncLog {
  id: string;
  direction: 'IN' | 'OUT';
  entity: string;
  ok: boolean;
  count: number;
  message: string | null;
  createdAt: string;
}

export interface OneCStatus {
  pending: number;
  errors: number;
  sent: number;
  lastIn: SyncLog | null;
  lastOut: SyncLog | null;
  apiKeyConfigured?: boolean;
}

export type OneCDocType = 'CUSTOMER_ORDER' | 'PRODUCTION' | 'SALE';
export type OneCDocStatus = 'PENDING' | 'SENT' | 'ERROR';

export interface OneCDoc {
  id: string;
  type: OneCDocType;
  status: OneCDocStatus;
  attempts: number;
  lastError: string | null;
  oneCNumber: string | null;
  createdAt: string;
  sentAt: string | null;
  order: { id: string; number: number; partner: { name: string } } | null;
  productionSheet: { id: string; number: number } | null;
}

export interface Invoice {
  orderId: string;
  number: number;
  status: OrderStatus;
  date: string;
  partner: { name: string; inn: string | null; contactName: string | null; phone: string | null; oneCId: string | null };
  deliveryAddress: string;
  comment: string | null;
  items: { name: string; unit: string; qty: number; price: number; sum: number }[];
  total: number;
}

/** Заказ в офисном списке: сервер отдаёт и служебные поля. */
export type OfficeOrder = Order & { paidAt?: string | null; updatedAt?: string; partnerId?: string; partner: Order['partner'] & { priceTypeId?: string | null } };

export interface CreateUserInput {
  name: string;
  role: Role;
  phone?: string;
  login?: string;
  password?: string;
  email?: string;
  accessExpiresAt?: string;
  canOrder?: boolean;
  partnerId?: string;
}

export type UpdateUserInput = Partial<{
  name: string;
  role: Role;
  phone: string | null;
  login: string | null;
  password: string;
  email: string;
  status: 'ACTIVE' | 'BLOCKED';
  accessExpiresAt: string | null;
  canOrder: boolean;
  partnerId: string | null;
}>;

export interface CreatePartnerInput {
  name: string;
  inn?: string;
  contactName: string;
  phone: string;
  email?: string;
  priceTypeId?: string;
  address?: string;
  createUser?: boolean;
}

/* ───────── Запросы ───────── */

// PUT нет в общем клиенте — передаём метод напрямую, fetch его поддерживает.
const put = <T>(p: string, b: unknown) => request<T>('PUT' as 'POST', p, b);

export const Admin = {
  dashboard: () => api.get<Dashboard>('/admin/dashboard'),

  partners: (q: { status?: PartnerStatus; search?: string } = {}) =>
    api.get<AdminPartner[]>(`/admin/partners${qs({ status: q.status, search: q.search })}`),
  partner: (id: string) => api.get<PartnerDetail>(`/admin/partners/${id}`),
  createPartner: (dto: CreatePartnerInput) => api.post<AdminPartner>('/admin/partners', dto),
  updatePartner: (id: string, dto: Partial<{ name: string; inn: string; contactName: string; phone: string; email: string; priceTypeId: string | null; oneCId: string | null; note: string }>) =>
    api.patch<AdminPartner>(`/admin/partners/${id}`, dto),
  approvePartner: (id: string, dto: { priceTypeId?: string; oneCId?: string }) => api.post<AdminPartner>(`/admin/partners/${id}/approve`, dto),
  rejectPartner: (id: string, reason: string) => api.post<AdminPartner>(`/admin/partners/${id}/reject`, { reason }),
  blockPartner: (id: string, reason: string) => api.post<AdminPartner>(`/admin/partners/${id}/block`, { reason }),
  unblockPartner: (id: string) => api.post<AdminPartner>(`/admin/partners/${id}/unblock`),
  counterparties: (search?: string) => api.get<Counterparty[]>(`/admin/onec/counterparties${qs({ search })}`),

  users: (q: { role?: Role; search?: string } = {}) => api.get<AdminUser[]>(`/admin/users${qs({ role: q.role, search: q.search })}`),
  createUser: (dto: CreateUserInput) => api.post<AdminUser>('/admin/users', dto),
  updateUser: (id: string, dto: UpdateUserInput) => api.patch<AdminUser>(`/admin/users/${id}`, dto),

  products: () => api.get<AdminProduct[]>('/admin/catalog/products'),
  categories: () => api.get<AdminCategory[]>('/admin/catalog/categories'),
  priceTypes: () => api.get<PriceType[]>('/admin/catalog/price-types'),
  updateProduct: (id: string, dto: Partial<Pick<AdminProduct, 'name' | 'description' | 'composition' | 'weight' | 'shelfLife' | 'unit' | 'multiplicity' | 'visible' | 'isNew' | 'categoryId'>>) =>
    api.patch<AdminProduct>(`/admin/catalog/products/${id}`, dto),
  setPrices: (id: string, items: { priceTypeId: string; price: number | null }[]) =>
    put<{ ok: true }>(`/admin/catalog/products/${id}/prices`, { items }),

  settings: () => api.get<Settings>('/admin/settings'),
  saveSettings: (dto: Partial<Settings>) => put<Settings>('/admin/settings', dto),

  sales: (from: string, to: string) => api.get<SalesReport>(`/reports/sales${qs({ from, to })}`),
  debts: () => api.get<DebtRow[]>('/reports/debts'),
  invoices: (date: string) => api.get<Invoice[]>(`/invoices${qs({ date })}`),

  onecStatus: () => api.get<OneCStatus>('/admin/onec/status'),
  onecDocs: (status?: OneCDocStatus) => api.get<OneCDoc[]>(`/admin/onec/documents${qs({ status })}`),
  onecRetry: (id: string) => api.post<OneCDoc>(`/admin/onec/documents/${id}/retry`),

  orders: (q: { status?: OrderStatus[]; dateFrom?: string; dateTo?: string; search?: string; partnerId?: string } = {}) =>
    api.get<OfficeOrder[]>(
      `/orders${qs({ status: q.status?.join(','), dateFrom: q.dateFrom, dateTo: q.dateTo, search: q.search, partnerId: q.partnerId })}`,
    ),
  updateItems: (id: string, items: { productId: string; qty: number }[], comment?: string) =>
    api.patch<OfficeOrder>(`/orders/${id}/items`, { items, comment }),

  changePassword: (newPassword: string, currentPassword?: string) =>
    api.post<{ token: string; user: User }>('/auth/me/password', { newPassword, currentPassword: currentPassword || undefined }),
};

/** Excel-выгрузки (нужен токен, поэтому качаем сами и отдаём в «Поделиться»). */
export const ExcelPaths = {
  sales: (from: string, to: string) => ({ path: `/reports/sales.xlsx${qs({ from, to })}`, filename: `bulo-sales-${from}_${to}.xlsx` }),
  orders: (from: string, to: string) => ({ path: `/reports/orders.xlsx${qs({ from, to })}`, filename: `bulo-orders-${from}_${to}.xlsx` }),
  invoices: (date: string) => ({ path: `/invoices/xlsx${qs({ date })}`, filename: `bulo-invoices-${date}.xlsx` }),
  onec: (markSent: boolean) => ({
    path: `/admin/onec/export.xlsx${qs({ onlyPending: 'true', markSent: markSent ? 'true' : undefined })}`,
    filename: `bulo-1c-${new Date().toISOString().slice(0, 10)}.xlsx`,
  }),
};

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Скачивает файл с авторизацией и открывает системное «Поделиться» (в вебе — обычное скачивание). */
export async function shareFile({ path, filename }: { path: string; filename: string }) {
  const url = API_URL + path;
  const token = getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (Platform.OS === 'web') {
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch {
      throw new ApiError('Нет связи с сервером. Проверьте интернет', 0);
    }
    if (!res.ok) {
      let msg = 'Не удалось скачать файл';
      try {
        const b = await res.json();
        if (typeof b?.message === 'string') msg = b.message;
      } catch {}
      throw new ApiError(msg, res.status);
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    return;
  }
  const dest = new File(Paths.cache, filename);
  let file: File;
  try {
    file = await File.downloadFileAsync(url, dest, { headers, idempotent: true });
  } catch (e: any) {
    throw new ApiError(e?.message?.includes('401') ? 'Сессия истекла — войдите снова' : 'Не удалось скачать файл', 0);
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: XLSX, dialogTitle: filename, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
  } else {
    throw new ApiError('На этом устройстве нельзя поделиться файлом', 0);
  }
}

export interface PickedImage {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  /** В вебе ImagePicker отдаёт File */
  file?: Blob | null;
}

/** Загрузка фото товара с прогрессом (XHR — единственный способ получить прогресс отправки и в вебе, и на телефоне). */
export function uploadProductPhoto(productId: string, img: PickedImage, onProgress?: (p: number) => void): Promise<AdminProduct> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    const type = img.mimeType || (img.uri.endsWith('.png') ? 'image/png' : 'image/jpeg');
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const name = img.fileName || `photo.${ext}`;
    if (Platform.OS === 'web') {
      const finish = (blob: Blob) => {
        form.append('file', blob, name);
        send();
      };
      if (img.file) finish(img.file);
      else
        fetch(img.uri)
          .then((r) => r.blob())
          .then(finish)
          .catch(() => reject(new ApiError('Не удалось прочитать фото', 0)));
    } else {
      form.append('file', { uri: img.uri, name, type } as unknown as Blob);
      send();
    }

    function send() {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/admin/catalog/products/${productId}/photo`);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        let body: any = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as AdminProduct);
        else reject(new ApiError(typeof body?.message === 'string' ? body.message : 'Не удалось загрузить фото', xhr.status));
      };
      xhr.onerror = () => reject(new ApiError('Нет связи с сервером. Проверьте интернет', 0));
      xhr.send(form);
    }
  });
}

/** Ссылка на фото: сервер может отдать localhost — на телефоне подменяем на адрес API. */
export function photoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const origin = API_URL.replace(/\/api$/, '');
  if (url.startsWith('/')) return origin + url;
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, origin);
}
