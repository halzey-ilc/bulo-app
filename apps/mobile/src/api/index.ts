import { api } from './client';
import type {
  Address,
  CourierRoute,
  Tracking,
  AuthResponse,
  Category,
  Info,
  Notification,
  Order,
  OrderRules,
  OtpResponse,
  Product,
  ProductionSheet,
  ProductionSummary,
  User,
} from './types';
import type { OrderStatus } from '../shared';

export * from './client';
export * from './types';

const qs = (o: Record<string, string | undefined | null | false>) => {
  const p = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const Auth = {
  requestOtp: (phone: string, purpose: 'LOGIN' | 'REGISTER' | 'CHANGE_PHONE') =>
    api.post<OtpResponse>('/auth/otp', { phone, purpose }),
  loginOtp: (phone: string, code: string) => api.post<AuthResponse>('/auth/login/otp', { phone, code }),
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
};

export const Catalog = {
  categories: () => api.get<Category[]>('/catalog/categories'),
  products: (q: { categoryId?: string; search?: string; isNew?: boolean } = {}) =>
    api.get<Product[]>(`/catalog/products${qs({ categoryId: q.categoryId, search: q.search, isNew: q.isNew ? 'true' : undefined })}`),
  product: (id: string) => api.get<Product>(`/catalog/products/${id}`),
  info: () => api.get<Info>('/info'),
};

export const Orders = {
  rules: () => api.get<OrderRules>('/orders/rules'),
  list: (status?: OrderStatus[]) => api.get<Order[]>(`/orders${qs({ status: status?.join(',') })}`),
  get: (id: string) => api.get<Order>(`/orders/${id}`),
  create: (dto: { deliveryDate: string; addressId?: string; comment?: string; items: { productId: string; qty: number }[] }) =>
    api.post<Order>('/orders', dto),
  setStatus: (
    id: string,
    status: OrderStatus,
    extra: { comment?: string; receivedBy?: string } = {},
  ) => api.post<Order>(`/orders/${id}/status`, { status, ...extra }),
  /** Отметить оплату (бухгалтер, админ). Статус заказа не меняется. */
  markPaid: (id: string, extra: { paymentMethod?: string; comment?: string } = {}) => api.post<Order>(`/orders/${id}/payment`, extra),
  tracking: (id: string) => api.get<Tracking>(`/orders/${id}/tracking`),
};

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

export const Notifications = {
  list: () => api.get<{ items: Notification[]; unread: number }>('/notifications'),
  readAll: () => api.post('/notifications/read'),
};

export const Production = {
  summary: (date: string) => api.get<ProductionSummary>(`/production/summary${qs({ date })}`),
  createSheet: (date: string) => api.post<ProductionSheet>('/production/sheets', { date }),
  sheet: (id: string) => api.get<ProductionSheet>(`/production/sheets/${id}`),
};
