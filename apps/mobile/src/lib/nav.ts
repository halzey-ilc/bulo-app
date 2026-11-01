import { router } from 'expo-router';

/**
 * Переход на вкладку из любого места: со вложенного экрана стека
 * сначала закрываем его, иначе вкладка переключится «под» ним.
 */
export function goTab(href: '/' | '/catalog' | '/cart' | '/orders') {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(href);
}
