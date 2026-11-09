import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Отправка push через Firebase Cloud Messaging (HTTP v1) — напрямую в Google, без Expo.
 * Ключ сервисного аккаунта Firebase — JSON-файл, путь в FCM_SERVICE_ACCOUNT (файл не коммитим).
 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let account: ServiceAccount | null | undefined;
let cached: { token: string; exp: number } | null = null;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const path = process.env.FCM_SERVICE_ACCOUNT;
  try {
    account = path ? (JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount) : null;
  } catch {
    account = null;
  }
  return account;
}

export function fcmConfigured() {
  return !!loadAccount();
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Firebase: ${body.error_description ?? res.status}`);
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600) };
  return body.access_token;
}

/** Отправляет push на токены FCM. Возвращает токены, которые больше не действуют (их нужно удалить). */
export async function sendFcm(tokens: string[], msg: { title: string; body: string; orderId?: string }): Promise<string[]> {
  const sa = loadAccount();
  if (!sa || !tokens.length) return [];
  const auth = await accessToken(sa);
  const dead: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data: msg.orderId ? { orderId: msg.orderId } : {},
            android: {
              priority: 'high',
              notification: { channel_id: 'default', sound: 'default', color: '#E94F15' },
            },
          },
        }),
      });
      if (res.ok) return;
      const text = await res.text();
      // устройство удалило приложение или токен испорчен — больше на него не шлём
      if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('"message.token"')) dead.push(token);
    }),
  );
  return dead;
}
