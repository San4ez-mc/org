import { Router } from 'express';
import { prisma } from '@platform/db';

/**
 * Каталог для панелі доступів SSO — той самий контракт, що вже працює у flows
 * (`apps/api/src/routes/authSso.js`):
 *   GET /api/auth/sso/projects → { projects: [{ id, name }] }
 *   GET /api/auth/sso/pages    → { pages:    [{ id, label }] }
 *
 * Авторизація власна (спільний секрет із SSO), тому монтується ОКРЕМО і ДО
 * `api.use(requireApiSecret)` — інакше SSO не пройде через токен платформи.
 */
export const ssoCatalog = Router();

const CLIENT_SECRET = process.env.SSO_CLIENT_SECRET || '';

function authorized(req: { header: (n: string) => string | undefined }): boolean {
  // Порожній секрет означає «SSO не налаштовано» — тоді нікого не пускаємо,
  // щоб випадково не відкрити список компаній усьому інтернету.
  if (!CLIENT_SECRET) return false;
  return (req.header('x-sso-secret') || '') === CLIENT_SECRET;
}

/** «Проєкти» орг-платформи — це компанії. */
ssoCatalog.get('/projects', async (req, res) => {
  if (!authorized(req)) return void res.status(401).json({ error: 'unauthorized' });
  try {
    const companies = await prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ projects: companies });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Пункти меню, які можна вмикати поштучно користувачу з роллю `user`.
 * Джерело правди — маршрути `apps/web/app/company/[id]/*`; при появі нової
 * сторінки додати рядок сюди, інакше її не буде видно в панелі доступів.
 */
ssoCatalog.get('/pages', (req, res) => {
  if (!authorized(req)) return void res.status(401).json({ error: 'unauthorized' });
  res.json({
    pages: [
      { id: 'dashboard', label: 'Дашборд' },
      { id: 'structure', label: 'Структура' },
      { id: 'processes', label: 'Процеси' },
      { id: 'instructions', label: 'Посадові інструкції' },
      { id: 'folder', label: 'Папка (Drive)' },
      { id: 'stats', label: 'Статистики' },
      { id: 'health', label: 'Здоровʼя компанії' },
      { id: 'journal', label: 'Журнал змін' },
      { id: 'import', label: 'Імпорт' },
      { id: 'logs', label: 'Логи' },
    ],
  });
});

/**
 * Люди компаній для панелі доступів SSO: хто це, яку посаду обіймає,
 * і з яким акаунтом SSO звʼязаний.
 *
 * Керівник береться ТІЛЬКИ з явно заданого `reportsToUnitId`. Виводити його з дерева
 * навмисне не будемо: на цьому полі триматиметься видимість чужих задач у трекері,
 * а будувати права доступу на здогадці не можна. Поки поле не заповнене — керівника
 * просто немає, і це чесніше за вгадану ієрархію.
 */
ssoCatalog.get('/people', async (req, res) => {
  if (!authorized(req)) return void res.status(401).json({ error: 'unauthorized' });
  try {
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;

    const members = await prisma.member.findMany({
      where: { ...(companyId ? { companyId } : {}), status: 'EMPLOYED' },
      select: {
        id: true, companyId: true, firstName: true, lastName: true,
        email: true, telegramUsername: true, ssoUserId: true, role: true,
        company: { select: { name: true } },
        posts: {
          where: { removedAt: null },
          select: { postUnit: { select: { id: true, name: true, reportsToUnitId: true } } },
        },
      },
      orderBy: [{ companyId: 'asc' }, { firstName: 'asc' }],
    });

    // Хто обіймає яку посаду — щоб перетворити reportsToUnitId у конкретну людину.
    const holderByUnit = new Map<string, string>();
    for (const m of members) {
      for (const p of m.posts) holderByUnit.set(p.postUnit.id, m.id);
    }

    res.json({
      people: members.map((m) => {
        const managerIds = m.posts
          .map((p) => p.postUnit.reportsToUnitId)
          .filter((u): u is string => Boolean(u))
          .map((u) => holderByUnit.get(u))
          .filter((x): x is string => Boolean(x) && x !== m.id);

        return {
          memberId: m.id,
          companyId: m.companyId,
          companyName: m.company.name,
          name: [m.firstName, m.lastName].filter(Boolean).join(' '),
          email: m.email,
          telegramUsername: m.telegramUsername,
          role: m.role,
          ssoUserId: m.ssoUserId,
          positions: m.posts.map((p) => p.postUnit.name),
          managerMemberId: managerIds[0] ?? null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Звʼязати людину в ORG з акаунтом SSO. Робиться явно: спільного ключа немає —
 * у людей в ORG заповнений telegram, а в SSO пошта, і перетину між ними нуль.
 */
ssoCatalog.post('/link', async (req, res) => {
  if (!authorized(req)) return void res.status(401).json({ error: 'unauthorized' });
  const memberId = String(req.body?.memberId || '').trim();
  const ssoUserId = req.body?.ssoUserId ? String(req.body.ssoUserId).trim() : null;
  if (!memberId) return void res.status(422).json({ error: 'memberId обовʼязковий' });

  try {
    // Одна людина може працювати в кількох компаніях, тому унікальність — у межах компанії.
    if (ssoUserId) {
      const member = await prisma.member.findUnique({ where: { id: memberId }, select: { companyId: true } });
      if (!member) return void res.status(404).json({ error: 'Людину не знайдено' });
      const taken = await prisma.member.findFirst({
        where: { companyId: member.companyId, ssoUserId, NOT: { id: memberId } },
        select: { id: true, firstName: true, lastName: true },
      });
      if (taken) {
        return void res.status(409).json({
          error: `Цей акаунт уже привʼязаний до «${[taken.firstName, taken.lastName].filter(Boolean).join(' ')}» у цій компанії`,
        });
      }
    }

    await prisma.member.update({ where: { id: memberId }, data: { ssoUserId } });
    res.json({ ok: true, memberId, ssoUserId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
