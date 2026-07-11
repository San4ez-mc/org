import { Router } from 'express';
import { prisma } from '@platform/db';
import { requireApiSecret } from '../middleware/auth';
import { handleAct } from '../services/agent';

/**
 * Контракт API платформи (§8 PLAN_PHASE1.md).
 * У I1 — лише каркас: ендпойнти зареєстровані та повертають 501 (Not Implemented).
 * Реалізація додається в наступних інкрементах (I5, I7, I8).
 */
export const api = Router();

api.use(requireApiSecret);

/** Записати зміну в журнал (не блокує основну дію). */
async function logChange(companyId: string, entity: string, action: string, summary: string, author?: string) {
  try {
    await prisma.changeLog.create({ data: { companyId, entity, action, summary, author: author || 'пульт' } });
  } catch {
    /* ignore */
  }
}

const notImplemented = (name: string) => (_: unknown, res: any) =>
  res.status(501).json({ error: `${name} ще не реалізовано (заглушка I1)` });

// Deep-link підключення до спільного бота
api.post('/bot/link/resolve', notImplemented('bot.link.resolve'));

// Головний ендпойнт агента: приймає intent від бота-воронки
api.post('/agent/act', async (req, res) => {
  try {
    const intent = req.body?.intent;
    if (!intent?.action) {
      res.status(400).json({ error: 'Очікується { intent: { action, params } }' });
      return;
    }
    const result = await handleAct(intent, {
      telegramId: req.body?.telegramId ? String(req.body.telegramId) : undefined,
      companyId: req.body?.companyId || undefined,
    });
    res.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[agent/act] помилка:', err);
    res.status(500).json({ reply: 'Сталася помилка під час виконання дії. Спробуй ще раз пізніше.' });
  }
});

// Список компаній (для веб-пульта Ф2)
api.get('/companies', async (_req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, abbr: true, driveRootFolderId: true, orgSheetId: true, createdAt: true },
    });
    res.json({ companies });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Одна компанія + орг-одиниці + процеси + працівники (для сторінки компанії)
api.get('/companies/:id', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        orgUnits: { orderBy: [{ boardNo: 'asc' }, { orderNo: 'asc' }] },
        processes: { orderBy: { createdAt: 'asc' } },
        members: { include: { posts: { include: { postUnit: { select: { id: true, name: true } } } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!company) {
      res.status(404).json({ error: 'Компанію не знайдено' });
      return;
    }
    res.json({ company });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Працівники (люди) ─────────────────────────────────────
api.post('/companies/:id/members', async (req, res) => {
  try {
    const { firstName, lastName, telegramUserId, telegramUsername, role, postUnitIds } = req.body ?? {};
    if (!firstName) return void res.status(400).json({ error: 'firstName обовʼязковий' });
    const member = await prisma.member.create({
      data: {
        companyId: req.params.id,
        firstName,
        lastName: lastName || null,
        telegramUserId: telegramUserId || null,
        telegramUsername: telegramUsername || null,
        role: role || 'EMPLOYEE',
        posts: Array.isArray(postUnitIds) && postUnitIds.length ? { create: postUnitIds.map((pid: string) => ({ postUnitId: pid })) } : undefined,
      },
      include: { posts: true },
    });
    await logChange(req.params.id, 'structure', 'create', `Додано працівника: ${firstName} ${lastName || ''}`.trim(), req.body?.author);
    res.json({ member });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.patch('/members/:id', async (req, res) => {
  try {
    const { firstName, lastName, telegramUserId, telegramUsername, photoUrl, role } = req.body ?? {};
    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(telegramUserId !== undefined && { telegramUserId }),
        ...(telegramUsername !== undefined && { telegramUsername }),
        ...(photoUrl !== undefined && { photoUrl }),
        ...(role !== undefined && { role }),
      },
    });
    res.json({ member });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.delete('/members/:id', async (req, res) => {
  try {
    const m = await prisma.member.findUnique({ where: { id: req.params.id }, select: { companyId: true, firstName: true, lastName: true } });
    await prisma.member.delete({ where: { id: req.params.id } });
    if (m) await logChange(m.companyId, 'structure', 'delete', `Видалено працівника: ${m.firstName} ${m.lastName || ''}`.trim(), req.body?.author);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Призначити / зняти з посади
api.post('/members/:id/posts', async (req, res) => {
  try {
    const { postUnitId } = req.body ?? {};
    if (!postUnitId) return void res.status(400).json({ error: 'postUnitId обовʼязковий' });
    await prisma.memberPost.upsert({
      where: { memberId_postUnitId: { memberId: req.params.id, postUnitId } },
      create: { memberId: req.params.id, postUnitId },
      update: {},
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.delete('/members/:id/posts/:postUnitId', async (req, res) => {
  try {
    await prisma.memberPost.deleteMany({ where: { memberId: req.params.id, postUnitId: req.params.postUnitId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Редагування орг-одиниць ───────────────────────────────
api.patch('/org-units/:id', async (req, res) => {
  try {
    const { name, ckp } = req.body ?? {};
    const unit = await prisma.orgUnit.update({
      where: { id: req.params.id },
      data: { ...(name !== undefined && { name }), ...(ckp !== undefined && { ckp }) },
    });
    await logChange(unit.companyId, 'structure', 'update', `Оновлено «${unit.name}»${ckp !== undefined ? ' (ЦКП)' : ''}`, req.body?.author);
    res.json({ unit });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.post('/companies/:id/org-units', async (req, res) => {
  try {
    const { parentId, name, ckp, type } = req.body ?? {};
    if (!parentId || !name) return void res.status(400).json({ error: 'parentId і name обовʼязкові' });
    const unit = await prisma.orgUnit.create({
      data: { companyId: req.params.id, parentId, name, ckp: ckp || null, type: type || 'POST' },
    });
    await logChange(req.params.id, 'structure', 'create', `Додано ${type === 'DEPARTMENT' ? 'відділ' : 'посаду'}: ${name}`, req.body?.author);
    res.json({ unit });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.delete('/org-units/:id', async (req, res) => {
  try {
    const unit = await prisma.orgUnit.findUnique({ where: { id: req.params.id }, select: { companyId: true, name: true } });
    await prisma.orgUnit.delete({ where: { id: req.params.id } });
    if (unit) await logChange(unit.companyId, 'structure', 'delete', `Видалено: ${unit.name}`, req.body?.author);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Журнал змін + технічні логи ───────────────────────────
api.get('/companies/:id/changes', async (req, res) => {
  try {
    const changes = await prisma.changeLog.findMany({ where: { companyId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ changes });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.get('/logs', async (req, res) => {
  try {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    const logs = await prisma.eventLog.findMany({ where: level ? { level } : undefined, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Онбординг (legacy-контракт — залишено як заглушки)
api.post('/onboarding/answer', notImplemented('onboarding.answer'));

// Інструкції та розповсюдження змін
api.post('/instructions/:id/edit', notImplemented('instructions.edit'));
api.get('/proposals', notImplemented('proposals.list'));
api.post('/proposals/:id/approve', notImplemented('proposals.approve'));
api.post('/proposals/:id/reject', notImplemented('proposals.reject'));

// Завантаження документів через бот
api.post('/documents/ingest', notImplemented('documents.ingest'));

// Семантичний пошук
api.post('/search', notImplemented('search'));
