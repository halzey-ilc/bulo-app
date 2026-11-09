import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Личные настройки на устройстве: избранное, недавние запросы, последний логин, онбординг.
 * Хранятся локально (AsyncStorage) и переживают выход из аккаунта.
 */
interface PrefsState {
  favorites: string[];
  recentSearches: string[];
  lastLogin: string;
  loginTab: 'phone' | 'password';
  onboardingSeen: boolean;
  /** Просмотренные истории: ключ группы → «подпись» содержимого (новые слайды снова подсвечивают кружок) */
  seenStories: Record<string, string>;
  /** Выбранный филиал кофейни (для гостей и без входа) */
  branchId: string | null;
  setBranch: (id: string | null) => void;
  markStorySeen: (key: string, sig: string) => void;
  toggleFavorite: (productId: string) => boolean;
  pushSearch: (q: string) => void;
  removeSearch: (q: string) => void;
  clearSearches: () => void;
  setLastLogin: (login: string) => void;
  setLoginTab: (t: 'phone' | 'password') => void;
  setOnboardingSeen: () => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recentSearches: [],
      lastLogin: '',
      loginTab: 'phone',
      onboardingSeen: false,
      seenStories: {},
      branchId: null,
      setBranch: (branchId) => set({ branchId }),
      markStorySeen: (key, sig) => set({ seenStories: { ...get().seenStories, [key]: sig } }),
      toggleFavorite: (id) => {
        const has = get().favorites.includes(id);
        set({ favorites: has ? get().favorites.filter((f) => f !== id) : [id, ...get().favorites] });
        return !has;
      },
      pushSearch: (q) => {
        const v = q.trim();
        if (v.length < 2) return;
        const rest = get().recentSearches.filter((s) => s.toLowerCase() !== v.toLowerCase());
        set({ recentSearches: [v, ...rest].slice(0, 6) });
      },
      removeSearch: (q) => set({ recentSearches: get().recentSearches.filter((s) => s !== q) }),
      clearSearches: () => set({ recentSearches: [] }),
      setLastLogin: (lastLogin) => set({ lastLogin }),
      setLoginTab: (loginTab) => set({ loginTab }),
      setOnboardingSeen: () => set({ onboardingSeen: true }),
    }),
    { name: 'bulo.prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const useIsFavorite = (id: string) => usePrefs((s) => s.favorites.includes(id));

/** Дождаться чтения настроек с диска (нужно для решения «показывать ли онбординг»). */
export function prefsHydrated(): Promise<void> {
  if (usePrefs.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = usePrefs.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
