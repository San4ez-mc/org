import { readFileSync, existsSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

/**
 * Стратегії автентифікації Google:
 *  - OAuth (пріоритет): файли створюються від імені користувача, на його диску (потрібно для @gmail).
 *    Вмикається, якщо є client id/secret + refresh token.
 *  - Сервіс-акаунт (fallback): годиться для читання і створення ТЕК, але не Google-файлів у My Drive
 *    (SA не має квоти сховища → "storage quota exceeded" для Docs/Sheets).
 */
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
];

export const OAUTH_SCOPES = SCOPES;
export const TOKEN_FILE = process.env.GOOGLE_OAUTH_TOKEN_FILE ?? 'secrets/google-oauth-token.json';

export function makeOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:4123/oauth2callback';
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET не задані в .env');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function readRefreshToken(): string | null {
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) return process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (existsSync(TOKEN_FILE)) {
    try {
      const t = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
      return t.refresh_token ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Від імені кого працюємо в межах одного запиту.
 *
 * Делегування налаштовується на КОЖНОГО клієнта окремо, тож глобальна змінна
 * середовища тут не годиться: другий клієнт ламав би першого. Передавати subject
 * аргументом у кожну функцію пакета означало б правку десятків сигнатур, тому тримаємо
 * його в контексті асинхронного виконання.
 */
const driveContext = new AsyncLocalStorage<{ subject?: string }>();

/** Виконати блок від імені користувача клієнта. Порожній subject — звичайна поведінка. */
export function runAsUser<T>(subject: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const s = subject?.trim();
  return s ? driveContext.run({ subject: s }, fn) : fn();
}

/** Контекст запиту має пріоритет; змінна середовища — запасний шлях для скриптів. */
function activeSubject(): string | undefined {
  return driveContext.getStore()?.subject || process.env.GOOGLE_IMPERSONATE_USER?.trim() || undefined;
}

/** Повертає авторизований клієнт: делегування → OAuth → сервіс-акаунт. */
export function getAuth(): OAuth2Client | InstanceType<typeof google.auth.GoogleAuth> {
  const subject = activeSubject();

  // Коли діємо від імені клієнта, OAuth-гілка вимкнена свідомо: там ми б діяли
  // від імені акаунта FINEKO, а не власника диска — і файли лягали б не туди.
  if (!subject) {
    const refreshToken = readRefreshToken();
    if (refreshToken) {
      const oauth = makeOAuthClient();
      oauth.setCredentials({ refresh_token: refreshToken });
      return oauth;
    }
  }

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyPath) {
    throw new Error('Немає ні OAuth refresh token, ні GOOGLE_SERVICE_ACCOUNT_JSON');
  }
  const credentials = JSON.parse(readFileSync(keyPath, 'utf8'));

  if (subject) {
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES, clientOptions: { subject } });
  }
  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

/** Який спосіб авторизації активний зараз (для діагностики). */
export function authMode(): 'oauth' | 'service_account' | 'domain_delegation' {
  if (activeSubject()) return 'domain_delegation';
  return readRefreshToken() ? 'oauth' : 'service_account';
}

export function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() as any });
}

export function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() as any });
}

export function getDocs() {
  return google.docs({ version: 'v1', auth: getAuth() as any });
}

/** Спільні параметри для роботи і з My Drive, і з Shared Drives. */
export const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

/**
 * Дані для екрана підключення Диска: що саме показати клієнту, щоб він видав доступ.
 * Читається з живої конфігурації, а не з константи в інтерфейсі — інакше при зміні
 * ключа інструкція почне брехати, і клієнт розшарить теку не на ту адресу.
 */
export function connectionInfo(): {
  mode: ReturnType<typeof authMode>;
  serviceAccountEmail: string | null;
  /** Числовий Client ID сервiс-акаунта: саме його вставляють в Admin Console при делегуваннi. */
  serviceAccountClientId: string | null;
  oauthClientId: string | null;
} {
  let serviceAccountEmail: string | null = null;
  let serviceAccountClientId: string | null = null;
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (keyPath && existsSync(keyPath)) {
    try {
      const key = JSON.parse(readFileSync(keyPath, 'utf8'));
      serviceAccountEmail = key.client_email ?? null;
      serviceAccountClientId = key.client_id ?? null;
    } catch {
      serviceAccountEmail = null;
    }
  }
  return {
    mode: authMode(),
    serviceAccountEmail,
    serviceAccountClientId,
    oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? null,
  };
}
