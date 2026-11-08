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
  /** Когда отмечена оплата; null — ещё не оплачен */
  paidAt?: string | null;
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
  bakeryLat?: number | null;
  bakeryLng?: number | null;
}

export interface Address {
  id: string;
  address: string;
  label: string | null;
  isDefault: boolean;
  lat?: number | null;
  lng?: number | null;
  /** Подъезд, этаж, ориентир */
  entrance?: string | null;
  /** Когда сюда последний раз заказывали — для «последних адресов» */
  lastUsedAt?: string | null;
  ordersCount?: number;
}

/** Вариант адреса из поиска. */
export interface GeoHit {
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  /** true — нашли сам дом, false — только улицу или район */
  exact: boolean;
}

/** Подсказка навигатора. */
export interface Maneuver {
  lat: number;
  lng: number;
  /** индекс точки на линии маршрута */
  at: number;
  kind: string;
  text: string;
  street: string | null;
  stop?: number;
}

/* ───────── Доставка ───────── */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface CourierPosition extends GeoPoint {
  heading: number | null;
  speed: number | null;
  accuracy?: number | null;
  at: string;
}

export interface CourierStop {
  orderId: string;
  number: number;
  status: 'SHIPPED' | 'READY';
  partner: { name: string; contactName: string | null; phone: string | null };
  address: string | null;
  entrance: string | null;
  comment: string | null;
  point: GeoPoint | null;
  itemsCount: number;
  unitsCount: number;
  total: number;
  deliveryDate: string;
  arrivedAt: string | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  etaAt: string | null;
}

export interface CourierRoute {
  bakery: GeoPoint;
  position: CourierPosition | null;
  onShift: boolean;
  route: { geometry: [number, number][]; byRoads: boolean; totalKm: number; totalMinutes: number; maneuvers?: Maneuver[] };
  stops: CourierStop[];
  toPickup: CourierStop[];
}

export type DeliveryStage = 'preparing' | 'ready' | 'on_way' | 'arriving' | 'arrived' | 'delivered' | 'cancelled';

export interface Tracking {
  orderId: string;
  number: number;
  status: string;
  stage: DeliveryStage;
  address: string | null;
  entrance: string | null;
  destination: GeoPoint | null;
  bakery: GeoPoint;
  courier: { name: string | null; phone: string | null } | null;
  position: CourierPosition | null;
  route: { geometry: [number, number][]; byRoads: boolean } | null;
  etaMinutes: number | null;
  etaAt: string | null;
  distanceKm: number | null;
  stopsBefore: number;
  shippedAt: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
  /** Только владельцу заказа и администратору */
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
