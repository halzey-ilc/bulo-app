import type { OrderStatus, PartnerStatus, Role } from '../shared';

export interface Partner {
  id: string;
  name: string;
  inn: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: PartnerStatus;
  rejectReason: string | null;
}

export interface User {
  id: string;
  phone: string | null;
  login: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  status: 'ACTIVE' | 'BLOCKED';
  canOrder: boolean;
  partnerId: string | null;
  partner: Partner | null;
  permissions: { canSeePrices: boolean; canOrder: boolean };
  /** Задан ли пароль: если нет, при смене текущий пароль не спрашиваем */
  hasPassword?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface OtpResponse {
  sent: boolean;
  phone: string;
  devCode?: string;
}

export interface Category {
  id: string;
  name: string;
  workshopArea: string | null;
  sortOrder: number;
  imageUrl: string | null;
  _count?: { products: number };
}

export interface Product {
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
  isNew: boolean;
  category: Category;
  price: number | null;
  pricesHidden: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  sum: number;
  photoUrl: string | null;
  category: string;
  multiplicity: number;
}

export interface OrderHistory {
  id: string;
  from: OrderStatus | null;
  to: OrderStatus;
  comment: string | null;
  createdAt: string;
  user: { id: string; name: string | null; role: Role } | null;
}

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  deliveryDate: string;
  deliveryAddress: string | null;
  comment: string | null;
  total: number;
  rejectReason: string | null;
  paymentMethod: string | null;
  createdAt: string;
  partner: Partner & { priceType?: { name: string } | null };
  items: OrderItem[];
  createdBy: { id: string; name: string | null; role: Role } | null;
  courier: { id: string; name: string | null; phone: string | null } | null;
  history: OrderHistory[];
  /** Только в GET /orders/:id */
  actions?: OrderStatus[];
}

export interface OrderRules {
  cutoffTime: string;
  minOrderSum: number;
  earliestDeliveryDate: string;
}

export interface Info {
  companyName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  workHours: string | null;
  instagram: string | null;
  whatsapp: string | null;
  telegram: string | null;
  cutoffTime: string;
  minOrderSum: number;
}

export interface Address {
  id: string;
  address: string;
  label: string | null;
  isDefault: boolean;
}

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  orderId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ProductionGroup {
  area: string;
  items: { productId: string; name: string; unit: string; qty: number; category: string }[];
}

export interface OrderBrief {
  id: string;
  number: number;
  status: OrderStatus;
  partner: string;
  total: number;
  deliveryAddress: string | null;
}

export interface ProductionSummary {
  date: string;
  awaitingPayment: number;
  pending: { orders: OrderBrief[]; groups: ProductionGroup[] };
  sheets: { id: string; number: number; date: string; isSupplement: boolean; ordersCount: number }[];
}

export interface ProductionSheet {
  id: string;
  number: number;
  date: string;
  isSupplement: boolean;
  orders: OrderBrief[];
  groups: ProductionGroup[];
}
