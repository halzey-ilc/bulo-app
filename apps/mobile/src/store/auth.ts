import { create } from 'zustand';
import { Auth, AuthResponse, setToken, setUnauthorizedHandler, User } from '../api';
import { secureStorage } from '../lib/storage';
import { Role } from '../shared';

const TOKEN_KEY = 'bulo.token';

interface AuthState {
  ready: boolean;
  token: string | null;
  user: User | null;
  /** Загрузить токен из хранилища и проверить его. */
  bootstrap: () => Promise<void>;
  signIn: (r: AuthResponse) => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  token: null,
  user: null,

  bootstrap: async () => {
    const token = await secureStorage.get(TOKEN_KEY);
    if (!token) return set({ ready: true });
    setToken(token);
    set({ token });
    try {
      const user = await Auth.me();
      set({ user, ready: true });
    } catch (e: any) {
      if (e?.status === 401) await get().signOut();
      // офлайн — оставим токен, попробуем позже
      set({ ready: true });
    }
  },

  signIn: async ({ token, user }) => {
    setToken(token);
    await secureStorage.set(TOKEN_KEY, token);
    set({ token, user });
  },

  refresh: async () => {
    if (!get().token) return;
    try {
      const user = await Auth.me();
      set({ user });
    } catch {
      // 401 обработает общий обработчик
    }
  },

  setUser: (user) => set({ user }),

  signOut: async () => {
    setToken(null);
    await secureStorage.remove(TOKEN_KEY);
    set({ token: null, user: null });
  },
}));

setUnauthorizedHandler(() => {
  void useAuth.getState().signOut();
});

export type Persona = 'anon' | 'buyer' | 'courier' | 'workshop' | 'admin' | 'manager' | 'accountant';

/** Партнёр, гость и клиент — «покупатели»; у каждой офисной роли свой набор вкладок. */
export function personaOf(role: Role | undefined | null): Persona {
  if (!role) return 'anon';
  if (role === 'COURIER') return 'courier';
  if (role === 'WORKSHOP') return 'workshop';
  if (role === 'ADMIN') return 'admin';
  if (role === 'MANAGER') return 'manager';
  if (role === 'ACCOUNTANT') return 'accountant';
  return 'buyer';
}

export const isOffice = (p: Persona) => p === 'admin' || p === 'manager' || p === 'accountant';

/** Набор и порядок вкладок для каждой роли. */
export const TABS: Record<Persona, string[]> = {
  anon: ['index', 'catalog', 'profile'],
  buyer: ['index', 'catalog', 'cart', 'orders', 'profile'],
  courier: ['deliveries', 'profile'],
  workshop: ['workshop', 'orders', 'profile'],
  admin: ['dashboard', 'orders', 'people', 'catalog', 'profile'],
  manager: ['dashboard', 'orders', 'people', 'catalog', 'profile'],
  accountant: ['dashboard', 'payments', 'reports', 'profile'],
};

export const HOME_HREF = {
  anon: '/',
  buyer: '/',
  courier: '/deliveries',
  workshop: '/workshop',
  admin: '/dashboard',
  manager: '/dashboard',
  accountant: '/dashboard',
} as const satisfies Record<Persona, string>;

export function usePersona(): Persona {
  return personaOf(useAuth((s) => s.user?.role));
}
