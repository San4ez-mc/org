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
