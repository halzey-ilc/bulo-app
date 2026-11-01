# BULO — мобильное приложение (iOS + Android)

Expo (SDK 58) + expo-router. Это **отдельный Expo-проект, а не npm-workspace**: у него свои `node_modules`.

```bash
cd apps/mobile
npm install            # отдельно от корня
npx expo start         # Expo Go / dev build; w — веб-версия
npx tsc --noEmit       # проверка типов
npx expo export --platform android
```

## Адрес API

По умолчанию `http://localhost:4000/api`. На реальном телефоне `localhost` — это сам телефон,
поэтому укажите LAN-IP компьютера с API:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.50:4000/api npx expo start
```

(или файл `apps/mobile/.env` со строкой `EXPO_PUBLIC_API_URL=...`).

## Push-уведомления

`src/lib/push.ts` регистрирует Expo push-токен (`POST /auth/push-token`) только на реальном устройстве и
только если в `app.json` задан `extra.eas.projectId` (появится после `npx eas-cli init`). В вебе, симуляторе
и без projectId регистрация тихо пропускается.

## Структура

- `app/` — экраны (expo-router): `(tabs)/` — вкладки по ролям, `login/`, `register`, `product/[id]`,
  `order/[id]`, `checkout`, `order-success`, `notifications`, `addresses`, `profile-edit`, `change-phone`,
  `contacts`, `sheet/[id]`.
- `src/api` — типизированный клиент API; `src/store` — сессия, корзина (сохраняется), тосты/диалоги;
  `src/theme` — цвета брендбука, отступы, шрифт Manrope; `src/components` — UI-кит, иконки, логотип;
  `src/shared.ts` — копия констант из `@bulo/shared`.
- Иконка и заставка (`assets/`) сгенерированы из `brand/bulo-logo.svg`.
