import type { OrderStatus, PartnerStatus, Role } from '@bulo/shared';

export type { OrderStatus, PartnerStatus, Role };

export interface PriceType {
  id: string;
  name: string;
  isDefault: boolean;
  oneCId: string | null;
  _count?: { partners: number };
}

export interface Address {
  id: string;
  label: string | null;
  address: string;
  isDefault: boolean;
}

export interface Partner {
  id: string;
  name: string;
  inn: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: PartnerStatus;
  rejectReason: string | null;
  priceTypeId: string | null;
  oneCId: string | null;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  priceType: PriceType | null;
  addresses?: Address[];
  _count?: { orders: number; users: number };
}

export interface Counterparty {
  oneCId: string;
  name: string;
  inn: string | null;
  address: string | null;
  phone: string | null;
}

export interface User {
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
  partner: { id: string; name: string; status?: PartnerStatus } | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PartnerDetail extends Partner {
  users: User[];
  orders: Order[];
  counterparty: Counterparty | null;
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

export interface UserRef {
  id: string;
  name: string;
  role: Role;
}

export interface HistoryEntry {
  id: string;
  from: OrderStatus | null;
  to: OrderStatus;
  comment: string | null;
  createdAt: string;
  user: UserRef | null;
}

export interface Order {
  id: string;
  number: number;
  partnerId: string;
  status: OrderStatus;
  deliveryDate: string;
  deliveryAddress: string | null;
  comment: string | null;
  total: number;
  rejectReason: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  productionSheetId: string | null;
  createdAt: string;
  partner?: Partner;
  items?: OrderItem[];
  createdBy?: UserRef;
  courier?: { id: string; name: string; phone: string | null } | null;
  history?: HistoryEntry[];
  actions?: OrderStatus[];
}

export interface Category {
  id: string;
  name: string;
  workshopArea: string | null;
  sortOrder: number;
  visible: boolean;
  imageUrl: string | null;
  oneCId: string | null;
  _count?: { products: number };
}

export interface ProductPrice {
  priceTypeId: string;
  price: number;
  priceType: PriceType;
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
  visible: boolean;
  isNew: boolean;
  sortOrder: number;
  oneCId: string | null;
  category: Category;
  prices: ProductPrice[];
}

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

export interface SheetShort {
  id: string;
  number: number;
  date: string;
  isSupplement: boolean;
  createdAt: string;
  ordersCount: number;
}

export interface AreaGroup {
  area: string;
  items: { productId?: string; name: string; unit: string; qty: number; category?: string }[];
}

export interface SheetOrder {
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
  pending: { orders: SheetOrder[]; groups: AreaGroup[] };
  sheets: SheetShort[];
}

export interface SheetDetail extends SheetShort {
  orders: SheetOrder[];
  groups: AreaGroup[];
}

export interface Invoice {
  orderId: string;
  number: number;
  status: OrderStatus;
  date: string;
  partner: { name: string; inn: string | null; contactName: string | null; phone: string | null; oneCId: string | null };
  deliveryAddress: string | null;
  comment: string | null;
  items: { name: string; unit: string; qty: number; price: number; sum: number }[];
  total: number;
}

export interface SalesReport {
  from: string;
  to: string;
  totals: { orders: number; total: number; paid: number; unpaid: number };
  byPartner: { partnerId: string; name: string; orders: number; total: number; paid: number; debt: number }[];
  byProduct: { productId: string; name: string; unit: string; qty: number; total: number }[];
  byDay: { date: string; orders: number; total: number }[];
}

export interface Settings {
  cutoffTime: string;
  minOrderSum: number;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  workHours: string | null;
  instagram: string | null;
  whatsapp: string | null;
  telegram: string | null;
  updatedAt?: string;
}

export interface OneCLog {
  id: string;
  direction: 'IN' | 'OUT';
  entity: string;
  ok: boolean;
  count: number | null;
  message: string | null;
  createdAt: string;
}

export interface OneCStatus {
  pending: number;
  errors: number;
  sent: number;
  lastIn: OneCLog | null;
  lastOut: OneCLog | null;
  apiKeyConfigured?: boolean;
}

export type OneCDocType = 'CUSTOMER_ORDER' | 'PRODUCTION' | 'SALE';

export interface OneCDocument {
  id: string;
  type: OneCDocType;
  status: string;
  orderId: string | null;
  productionSheetId: string | null;
  attempts: number;
  lastError: string | null;
  oneCNumber: string | null;
  createdAt: string;
  sentAt: string | null;
  order?: { id: string; number: number } | null;
  productionSheet?: { id: string; number: number; date: string } | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  data: unknown;
  createdAt: string;
  user: UserRef | null;
}
