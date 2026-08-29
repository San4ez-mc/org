import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Права користувача в орг-платформі.
 *
 * Раніше доступ давав один спільний токен `org_session`, однаковий для всіх: хто
 * увійшов — той бачив усі компанії. Пошта в куці `org_user` була лише для показу,
 * і до того ж не httpOnly, тобто редагувалась із консолі браузера. Тепер права
 * приходять із SSO і лежать у ПІДПИСАНІЙ httpOnly-куці, яку клієнт підробити не може.
 */
export interface Access {
  userId: string;
  email: string;
  /** superadmin бачить усі компанії; user — лише свої. */
  role: 'superadmin' | 'user' | 'none';
  /** Дозволені компанії (у SSO вони звуться projectIds продукту `org`). */
  companyIds: string[];
  /** Дозволені сторінки; порожньо = усі базові. */
  pageIds: string[];
  exp: number;
}

const COOKIE = 'org_access';
const TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Підписуємо тим самим AUTH_TOKEN, що вже є на сервері. Окремий секрет був би
 * чистішим, але це ще одна змінна, яку легко забути виставити при деплої, — а
 * забутий секрет тут означав би тихо непрацюючий захист.
 */
function secret(): string {
  const s = process.env.AUTH_TOKEN || '';
  if (!s) throw new Error('AUTH_TOKEN не заданий — нічим підписати сесію');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeAccess(access: Omit<Access, 'exp'>): string {
  const body = Buffer.from(JSON.stringify({ ...access, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeAccess(raw: string | undefined): Access | null {
  if (!raw) return null;
  const [body, mac] = raw.split('.');
  if (!body || !mac) return null;

  // Порівняння сталого часу — інакше зловмисник міг би підбирати підпис побайтово.
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Access;
    if (!data.exp || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export const ACCESS_COOKIE = COOKIE;
export const ACCESS_MAX_AGE = TTL_SECONDS;

/** Права поточного користувача. `null` — сесії немає або підпис не збігся. */
export function currentAccess(): Access | null {
  return decodeAccess(cookies().get(COOKIE)?.value);
}

/** Чи видно користувачу цю компанію. */
export function canSeeCompany(access: Access | null, companyId: string): boolean {
  if (!access || access.role === 'none') return false;
  if (access.role === 'superadmin') return true;
  return access.companyIds.includes(companyId);
}

/**
 * Відфільтрувати список компаній під права.
 *
 * Окремо від canSeeCompany навмисно: список і сторінка компанії — дві різні точки
 * входу, і закрити треба обидві. Сховати картку зі списку недостатньо — адресу
 * `/company/<id>` можна набрати руками.
 */
export function visibleCompanies<T extends { id: string }>(access: Access | null, companies: T[]): T[] {
  if (!access || access.role === 'none') return [];
  if (access.role === 'superadmin') return companies;
  return companies.filter((c) => access.companyIds.includes(c.id));
}
