import { Platform } from 'react-native';
import { api, API_URL, ApiError, getToken } from './client';
import type {
  Address,
  AuthResponse,
  Branch,
  Category,
  CourierRoute,
  GeoHit,
  Info,
  Loyalty,
  Notification,
  Order,
  OrderRules,
  OtpResponse,
  PaymentInfo,
  PaymentMethod,
  PickupSlots,
  Product,
  ProductionSheet,
  ProductionSummary,
  StoryItem,
  Tracking,
  User,
} from './types';
import type { OrderStatus } from '../shared';

export * from './client';
export * from './types';

const qs = (o: Record<string, string | number | undefined | null | false>) => {
  const p = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const Auth = {
  requestOtp: (phone: string, purpose: 'LOGIN' | 'REGISTER' | 'CHANGE_PHONE') =>
    api.post<OtpResponse>('/auth/otp', { phone, purpose }),
  /** Вход по коду; name — для нового гостя (аккаунт создаётся сразу) */
  loginOtp: (phone: string, code: string, name?: string) =>
    api.post<AuthResponse>('/auth/login/otp', { phone, code, name: name?.trim() || undefined }),
  loginPassword: (login: string, password: string) => api.post<AuthResponse>('/auth/login', { login, password }),
  register: (dto: {
    phone: string;
    code: string;
    partnerName: string;
    inn?: string;
    contactName: string;
    email?: string;
    address: string;
  }) => api.post<AuthResponse>('/auth/register', dto),
  me: () => api.get<User>('/auth/me'),
  updateMe: (dto: { name?: string; email?: string }) => api.patch<User>('/auth/me', dto),
  changePhone: (phone: string, code: string) => api.post<User>('/auth/me/phone', { phone, code }),
  pushToken: (token: string, platform: string) => api.post('/auth/push-token', { token, platform }),
  /** Удалить свой аккаунт */
  deleteMe: () => api.del<{ ok: true }>('/auth/me'),
};

export const Catalog = {
  categories: (branchId?: string | null) => api.get<Category[]>(`/catalog/categories${qs({ branchId })}`),
  products: (q: { categoryId?: string; search?: string; isNew?: boolean; branchId?: string | null } = {}) =>
    api.get<Product[]>(
      `/catalog/products${qs({ categoryId: q.categoryId, search: q.search, isNew: q.isNew ? 'true' : undefined, branchId: q.branchId })}`,
    ),
  product: (id: string, branchId?: string | null) => api.get<Product>(`/catalog/products/${id}${qs({ branchId })}`),
  info: () => api.get<Info>('/info'),
  branches: () => api.get<Branch[]>('/branches'),
  slots: (branchId: string) => api.get<PickupSlots>(`/branches/${branchId}/slots`),
  stories: () => api.get<StoryItem[]>('/stories'),
};

export const Orders = {
  rules: () => api.get<OrderRules>('/orders/rules'),
  list: (status?: OrderStatus[]) => api.get<Order[]>(`/orders${qs({ status: status?.join(',') })}`),
  get: (id: string) => api.get<Order>(`/orders/${id}`),
  create: (dto: {
    deliveryDate?: string;
    addressId?: string;
    comment?: string;
    paymentMethod?: PaymentMethod;
    branchId?: string;
    pickupAt?: string;
    items: { productId: string; qty: number }[];
  }) => api.post<Order>('/orders', dto),
  setStatus: (
    id: string,
    status: OrderStatus,
    extra: { comment?: string; receivedBy?: string; cashReceived?: boolean } = {},
  ) => api.post<Order>(`/orders/${id}/status`, { status, ...extra }),
  /** Отметить, что деньги получены (наличные при выдаче/доставке). */
  markPaid: (id: string, extra: { paymentMethod?: string; comment?: string } = {}) => api.post<Order>(`/orders/${id}/payment`, extra),
  /** Подтвердить заказ после оплаты (админ, менеджер; бронь кофейни — ещё и кассир). */
  confirm: (id: string, dto: { paymentMethod?: PaymentMethod; paid?: boolean; comment?: string } = {}) =>
    api.post<Order>(`/orders/${id}/confirm`, dto),
  payment: (id: string) => api.get<PaymentInfo>(`/orders/${id}/payment`),
  /** «Я оплатил» — с фото чека или без */
  claimPaid: (id: string, receipt?: { uri: string; mimeType?: string | null; fileName?: string | null; file?: Blob | null }) =>
    receipt ? uploadForm<Order>(`/orders/${id}/paid`, receipt) : api.post<Order>(`/orders/${id}/paid`),
  loyalty: () => api.get<Loyalty>('/orders/loyalty'),
  tracking: (id: string) => api.get<Tracking>(`/orders/${id}/tracking`),
};

/** Отправка картинки multipart (поле file). */
async function uploadForm<T>(path: string, img: { uri: string; mimeType?: string | null; fileName?: string | null; file?: Blob | null }): Promise<T> {
  const form = new FormData();
  const type = img.mimeType || (img.uri.endsWith('.png') ? 'image/png' : 'image/jpeg');
  const name = img.fileName || `receipt.${type.includes('png') ? 'png' : 'jpg'}`;
  if (Platform.OS === 'web') {
    const blob = img.file ?? (await (await fetch(img.uri)).blob());
    form.append('file', blob, name);
  } else {
    form.append('file', { uri: img.uri, name, type } as unknown as Blob);
  }
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет', 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(typeof body?.message === 'string' ? body.message : 'Не удалось отправить фото', res.status, body);
  return body as T;
}

export const Courier = {
  route: () => api.get<CourierRoute>('/courier/route'),
  shift: (on: boolean) => api.post<{ onShift: boolean }>('/courier/shift', { on }),
  location: (p: { lat: number; lng: number; accuracy?: number; heading?: number; speed?: number }) =>
    api.post('/courier/location', p),
  arrived: (orderId: string) => api.post(`/courier/orders/${orderId}/arrived`),
};

export type AddressDto = {
  address: string;
  label?: string;
  isDefault?: boolean;
  lat?: number | null;
  lng?: number | null;
  entrance?: string | null;
};

export const Addresses = {
  list: () => api.get<Address[]>('/me/addresses'),
  create: (dto: AddressDto) => api.post<Address>('/me/addresses', dto),
  update: (id: string, dto: AddressDto) =>
    api.patch<Address>(`/me/addresses/${id}`, dto),
  remove: (id: string) => api.del(`/me/addresses/${id}`),
};

export const Geo = {
  suggest: (q: string, near?: { lat: number; lng: number } | null) =>
    api.get<GeoHit[]>(`/geo/suggest${qs({ q, lat: near?.lat, lng: near?.lng })}`),
  reverse: (p: { lat: number; lng: number }) => api.get<GeoHit | null>(`/geo/reverse${qs({ lat: p.lat, lng: p.lng })}`),
};

export const Notifications = {
  list: () => api.get<{ items: Notification[]; unread: number }>('/notifications'),
  readAll: () => api.post('/notifications/read'),
};

export const Production = {
  summary: (date: string) => api.get<ProductionSummary>(`/production/summary${qs({ date })}`),
  createSheet: (date: string) => api.post<ProductionSheet>('/production/sheets', { date }),
  sheet: (id: string) => api.get<ProductionSheet>(`/production/sheets/${id}`),
};
