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
  /** Звідки права: 'sso' перепитуємо, 'password' — вхід власника, перепитувати нема в кого. */
  src?: 'sso' | 'password';
  /** Коли куку виписали — щоб знати, наскільки застарів знімок прав. */
  iat?: number;
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

export function encodeAccess(access: Omit<Access, 'exp' | 'iat'>): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...access, iat: now, exp: now + TTL_SECONDS })).toString('base64url');
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

/**
 * Скільки права живуть без перепиту в SSO.
 *
 * Кука сама по собі живе 30 днів, і цього досить для ВИДАЧІ доступу. Для ВІДКЛИКАННЯ
 * не досить: закритий у панелі доступ ще місяць працював би. Тому права — знімок,
 * який протухає за пʼять хвилин, після чого їх перепитуємо в SSO.
 */
const RIGHTS_TTL_MS = Number(process.env.ORG_RIGHTS_TTL_SECONDS || 300) * 1000;

/**
 * Скільки терпимо, коли SSO не відповідає.
 *
 * Падати одразу не можна — коротка недоступність SSO вимикала б усім роботу.
 * Але й вічно вірити старому знімку не можна, бо тоді відкликання знову не працює.
 * Тож поки SSO мовчить, працюємо за старими правами, але не довше цього строку.
 */
const STALE_LIMIT_MS = 6 * 60 * 60 * 1000;

type Rights = Pick<Access, 'role' | 'companyIds' | 'pageIds'>;
const rightsCache = new Map<string, { rights: Rights; at: number }>();

async function fetchRights(userId: string): Promise<Rights | null> {
  const sso = process.env.SSO_URL;
  const clientId = process.env.ORG_SSO_CLIENT_ID;
  const clientSecret = process.env.ORG_SSO_CLIENT_SECRET;
  if (!sso || !clientId || !clientSecret) return null;
  try {
    const res = await fetch(`${sso}/oauth/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, userId, product: 'org' }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { role?: string; projectIds?: string[]; pageIds?: string[] };
    return {
      role: p.role === 'superadmin' ? 'superadmin' : p.role === 'user' ? 'user' : 'none',
      companyIds: Array.isArray(p.projectIds) ? p.projectIds : [],
      pageIds: Array.isArray(p.pageIds) ? p.pageIds : [],
    };
  } catch {
    return null;
  }
}

/**
 * Права поточного користувача. `null` — сесії немає або підпис не збігся.
 *
 * Особу бере з підписаної куки (її не підробити), а права — свіжі з SSO. Кеш на
 * пʼять хвилин, щоб не ходити в SSO на кожен рендер.
 */
export async function currentAccess(): Promise<Access | null> {
  const access = decodeAccess(cookies().get(COOKIE)?.value);
  if (!access) return null;

  // Вхід власника за майстер-паролем: такого користувача в SSO немає, перепитувати нема в кого.
  if (access.src === 'password' || !access.userId || access.userId === 'owner') return access;

  const hit = rightsCache.get(access.userId);
  if (hit && Date.now() - hit.at < RIGHTS_TTL_MS) return { ...access, ...hit.rights };

  const fresh = await fetchRights(access.userId);
  if (fresh) {
    rightsCache.set(access.userId, { rights: fresh, at: Date.now() });
    return { ...access, ...fresh };
  }

  // SSO мовчить. Працюємо за знімком із куки, але лише поки він не надто старий.
  const issued = (access.iat ?? 0) * 1000;
  if (issued && Date.now() - issued > STALE_LIMIT_MS) {
    return { ...access, role: 'none', companyIds: [], pageIds: [] };
  }
  return access;
}

/** Забути кешовані права — після зміни доступів, щоб не чекати пʼять хвилин. */
export function forgetRights(userId?: string): void {
  if (userId) rightsCache.delete(userId);
  else rightsCache.clear();
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

/**
 * Хто зайшов — для показу, не для прав.
 *
 * Пошта береться з підписаної org_access, коли та є: там її не підмінити. На
 * екрані відмови підписаної куки ще нема, тож лишається org_user — і це нормально,
 * бо там ця пошта нічого не відкриває, вона лише пояснює, чому доступу нема.
 */
export function displayUser(): { name: string; email: string } | null {
  const jar = cookies();
  const read = (k: string) => {
    const v = jar.get(k)?.value;
    if (!v) return '';
    try { return decodeURIComponent(v); } catch { return v; }
  };
  // Навмисно без перепиту в SSO: тут потрібне лише імʼя для показу, а ходити
  // по мережі заради підпису в шапці — зайве.
  const email = decodeAccess(jar.get(COOKIE)?.value)?.email || read('org_user');
  const name = read('org_user_name');
  if (!email && !name) return null;
  return { name, email };
}
