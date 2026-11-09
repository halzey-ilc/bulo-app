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
  /** Покупатель: гость кофейни (CAFE) или партнёр (PARTNER); у сотрудников null */
  channel?: 'CAFE' | 'PARTNER' | null;
  /** Любимый филиал гостя */
  branchId?: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface OtpResponse {
  sent: boolean;
  phone: string;
  devCode?: string;
  /** Номера ещё нет — после кода создадим аккаунт гостя, нужно имя */
  isNew?: boolean;
  name?: string | null;
}

export interface Category {
  id: string;
  name: string;
  workshopArea: string | null;
  sortOrder: number;
  imageUrl: string | null;
  section?: string | null;
  promoCoffee?: boolean;
  _count?: { products: number };
}

/** Филиал кофейни. */
export interface Branch {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  opensAt: string;
  closesAt: string;
  menuSize: number;
}

export interface PickupSlot {
  at: string;
  time: string;
  date: string;
}

export interface PickupSlots {
  opensAt: string;
  closesAt: string;
  today: PickupSlot[];
  tomorrow: PickupSlot[];
  closedToday: boolean;
}

/** История на главной (ведут админ и менеджер). */
export interface StoryItem {
  id: string;
  title: string;
  caption: string | null;
  imageUrl: string;
  productId: string | null;
  audience: string;
  createdAt: string;
}

/** Карта гостя «N-й кофе бесплатно». */
export interface Loyalty {
  enabled: boolean;
  every: number;
  total: number;
  stamps: number;
  untilFree: number;
  nextIsFree: boolean;
}

export type PaymentMethod = 'QR' | 'BANK' | 'CASH';

/** Как оплатить заказ. */
export interface PaymentInfo {
  orderId: string;
  number: number;
  amount: number;
  method: PaymentMethod | null;
  paidAt: string | null;
  claimedAt: string | null;
  receiptUrl: string | null;
  /** value — строка QR (ссылка банка), image — готовая картинка PNG (data:) */
  qr: { value: string; image: string | null; withAmount: boolean; recipient: string } | null;
  bank: {
    name: string | null;
    recipient: string | null;
    account: string | null;
    bik: string | null;
    inn: string | null;
    purpose: string;
  } | null;
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
  /** Кофе по акции «7-й бесплатно» */
  promo?: boolean;
  /** Свободный остаток из 1С; null — не отслеживается */
  stock?: number | null;
  /** Филиал, по которому посчитана цена (меню кофейни) */
  branchId?: string | null;
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
  promo?: boolean;
  /** Сколько штук в подарок по акции */
  freeQty?: number;
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
  paymentMethod: PaymentMethod | string | null;
  createdAt: string;
  /** PARTNER — опт с доставкой, CAFE — бронь гостя в филиале */
  channel: 'PARTNER' | 'CAFE';
  /** Название партнёра или имя гостя */
  buyer: string;
  partner: (Partner & { priceType?: { name: string } | null }) | null;
  branch: { id: string; name: string; address: string | null; phone: string | null; lat: number | null; lng: number | null } | null;
  pickupAt: string | null;
  discount: number;
  freeCoffees: number;
  confirmedAt: string | null;
  paymentClaimedAt: string | null;
  receiptUrl: string | null;
  items: OrderItem[];
  createdBy: { id: string; name: string | null; role: Role; phone?: string | null } | null;
  courier: { id: string; name: string | null; phone: string | null } | null;
  history: OrderHistory[];
  /** Только в GET /orders/:id */
  actions?: OrderStatus[];
  canConfirm?: boolean;
  canMarkPaid?: boolean;
}

export interface OrderRules {
  cutoffTime: string;
  minOrderSum: number;
  earliestDeliveryDate: string;
  promo?: { enabled: boolean; every: number };
  payment?: { qr: boolean; bank: boolean };
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
