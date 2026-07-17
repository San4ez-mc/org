import { Router } from 'express';
import { randomBytes } from 'crypto';
import { prisma } from '@platform/db';
import { findFolderByName, listFolderTree } from '@platform/drive';
import { stepsToMermaid } from '@platform/ai';
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
    const { firstName, lastName, telegramUserId, telegramUsername, email, birthDate, role, postUnitIds } = req.body ?? {};
    if (!firstName) return void res.status(400).json({ error: 'firstName обовʼязковий' });
    const member = await prisma.member.create({
      data: {
        companyId: req.params.id,
        firstName,
        lastName: lastName || null,
        telegramUserId: telegramUserId || null,
        telegramUsername: telegramUsername || null,
        email: email || null,
        birthDate: birthDate ? new Date(birthDate) : null,
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
    const { firstName, lastName, telegramUserId, telegramUsername, email, birthDate, photoUrl, role } = req.body ?? {};
    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(telegramUserId !== undefined && { telegramUserId: telegramUserId || null }),
        ...(telegramUsername !== undefined && { telegramUsername: telegramUsername || null }),
        ...(email !== undefined && { email: email || null }),
        ...(birthDate !== undefined && { birthDate: birthDate ? new Date(birthDate) : null }),
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

// ── Портал працівника (персональна зведена інформація) ─────
type MemberWithPosts = { id: string; firstName: string; lastName: string | null; role: string; companyId: string; posts: { postUnitId: string }[] };

async function buildMemberSummary(member: MemberWithPosts) {
  const postUnitIds = member.posts.map((p) => p.postUnitId);
  const units = await prisma.orgUnit.findMany({
    where: { id: { in: postUnitIds } },
    include: { parent: { include: { parent: { include: { parent: true } } } } },
  });
  const postNames = units.map((u) => u.name);
  const [company, statistics] = await Promise.all([
    prisma.company.findUnique({ where: { id: member.companyId }, include: { processes: { orderBy: { createdAt: 'asc' } } } }),
    prisma.statistic.findMany({ where: { orgUnitId: { in: postUnitIds } }, include: { orgUnit: { select: { id: true, name: true, type: true } } } }),
  ]);
  const processes = (company?.processes ?? []).filter(
    (pr) => Array.isArray(pr.steps) && (pr.steps as { postTitle?: string }[]).some((s) => s?.postTitle && postNames.includes(s.postTitle)),
  );
  const ancestors = (u: { parent?: { name: string; parent?: { name: string; parent?: { name: string } | null } | null } | null }) => {
    const names: string[] = [];
    let p = u.parent;
    while (p) { names.unshift(p.name); p = p.parent ?? null; }
    return names;
  };
  return {
    member: { id: member.id, firstName: member.firstName, lastName: member.lastName, role: member.role },
    company: company ? { id: company.id, name: company.name } : null,
    posts: units.map((u) => ({ id: u.id, name: u.name, ckp: u.ckp, path: ancestors(u) })),
    processes: processes.map((pr) => ({ id: pr.id, name: pr.name, description: pr.description, steps: pr.steps })),
    statistics,
  };
}

// Згенерувати/повернути особисте посилання входу для працівника
api.post('/members/:id/access-token', async (req, res) => {
  try {
    const m = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!m) return res.status(404).json({ error: 'not found' });
    const token = m.accessToken || randomBytes(24).toString('hex');
    if (!m.accessToken) await prisma.member.update({ where: { id: m.id }, data: { accessToken: token } });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Зведення для працівника за особистим токеном (портал)
api.get('/me/:token', async (req, res) => {
  try {
    const member = await prisma.member.findUnique({ where: { accessToken: req.params.token }, include: { posts: true } });
    if (!member) return res.status(404).json({ error: 'not found' });
    res.json({ summary: await buildMemberSummary(member) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Зведення для працівника за Telegram id (для бота-самообслуговування)
api.get('/members/by-telegram/:tgId', async (req, res) => {
  try {
    const member = await prisma.member.findFirst({ where: { telegramUserId: req.params.tgId }, include: { posts: true } });
    if (!member) return res.status(404).json({ error: 'not found' });
    res.json({ summary: await buildMemberSummary(member) });
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

// ── Дерево посадових інструкцій (з Drive: Побудова → Посадові інструкції) ──
api.get('/companies/:id/instructions', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { driveRootFolderId: true } });
    if (!company?.driveRootFolderId) return void res.json({ tree: [], reason: 'no-drive' });
    const pobudova = await findFolderByName(company.driveRootFolderId, '1. Відділення побудови');
    if (!pobudova) return void res.json({ tree: [], reason: 'no-pobudova' });
    const instr = await findFolderByName(pobudova, 'Посадові інструкції');
    if (!instr) return void res.json({ tree: [], reason: 'no-instructions-folder' });
    const tree = await listFolderTree(instr);
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Інструкції як first-class записи БД (#276) ─────────────
// Зміст інструкцій — на Google Drive (driveDocId, G3); у БД лише посилання +
// метадані + звʼязки (посада/процес) + версія. Журнал фіксує тільки що змінилось.
function shapeInstruction(r: any) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    version: r.version,
    driveDocId: r.driveDocId ?? null,
    folderPath: r.folderPath ?? null,
    postUnitId: r.postUnitId ?? null,
    post: r.postUnit ? { id: r.postUnit.id, name: r.postUnit.name } : null,
    processId: r.processId ?? null,
    process: r.process ? { id: r.process.id, name: r.process.name } : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Гачок індексації у вектор-мікросервіс (#263/#280). Поки заглушка: реальний виклик
// зʼявиться, коли буде мапа компанія→проєкт/токен вектор-сервісу. Не блокує запис.
async function queueInstructionIndexing(_instructionId: string): Promise<void> {
  // TODO(#263): POST {VECTOR_SERVICE_URL}/ingest — driveDocId + чанки за токеном компанії.
  return;
}

const instructionInclude = {
  postUnit: { select: { id: true, name: true } },
  process: { select: { id: true, name: true } },
} as const;

api.get('/companies/:id/instruction-records', async (req, res) => {
  try {
    const companyId = req.params.id;
    const postUnitId = typeof req.query.postUnitId === 'string' ? req.query.postUnitId : undefined;
    const rows = await prisma.instruction.findMany({
      where: { companyId, ...(postUnitId ? { postUnitId } : {}) },
      include: instructionInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ instructions: rows.map(shapeInstruction) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.post('/companies/:id/instruction-records', async (req, res) => {
  try {
    const companyId = req.params.id;
    const { title, postUnitId, processId, driveDocId, folderPath, status } = req.body ?? {};
    if (!title) return void res.status(400).json({ error: 'title обовʼязковий' });
    const created = await prisma.instruction.create({
      data: {
        companyId,
        title: String(title),
        postUnitId: postUnitId || null,
        processId: processId || null,
        driveDocId: driveDocId || null,
        folderPath: folderPath || null,
        status: status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
      },
      include: instructionInclude,
    });
    await logChange(companyId, 'instruction', 'create', `Створено інструкцію: ${title}`, req.body?.author);
    await queueInstructionIndexing(created.id);
    res.json({ instruction: shapeInstruction(created) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.patch('/instruction-records/:id', async (req, res) => {
  try {
    const existing = await prisma.instruction.findUnique({ where: { id: req.params.id }, select: { companyId: true } });
    if (!existing) return void res.status(404).json({ error: 'Інструкцію не знайдено' });
    const { title, postUnitId, processId, driveDocId, folderPath, status } = req.body ?? {};
    // Зміна назви/змісту/статусу піднімає версію
    const bumpVersion = title !== undefined || driveDocId !== undefined || status !== undefined;
    const updated = await prisma.instruction.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title: String(title) }),
        ...(postUnitId !== undefined && { postUnitId: postUnitId || null }),
        ...(processId !== undefined && { processId: processId || null }),
        ...(driveDocId !== undefined && { driveDocId: driveDocId || null }),
        ...(folderPath !== undefined && { folderPath: folderPath || null }),
        ...(status !== undefined && { status: status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT' }),
        ...(bumpVersion && { version: { increment: 1 } }),
      },
      include: instructionInclude,
    });
    await logChange(existing.companyId, 'instruction', 'update', `Оновлено інструкцію: ${updated.title}`, req.body?.author);
    await queueInstructionIndexing(updated.id);
    res.json({ instruction: shapeInstruction(updated) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.delete('/instruction-records/:id', async (req, res) => {
  try {
    const existing = await prisma.instruction.findUnique({ where: { id: req.params.id }, select: { companyId: true, title: true } });
    if (!existing) return void res.status(404).json({ error: 'Інструкцію не знайдено' });
    await prisma.instruction.delete({ where: { id: req.params.id } });
    await logChange(existing.companyId, 'instruction', 'delete', `Видалено інструкцію: ${existing.title}`, req.body?.author);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Звʼязок інструкція↔інструкція (основа розповсюдження змін #224)
api.post('/instruction-records/:id/links', async (req, res) => {
  try {
    const { relatedInstructionId, relationType, weight } = req.body ?? {};
    if (!relatedInstructionId) return void res.status(400).json({ error: 'relatedInstructionId обовʼязковий' });
    if (relatedInstructionId === req.params.id) return void res.status(422).json({ error: 'не можна лінкувати саму на себе' });
    const link = await prisma.instructionLink.upsert({
      where: { instructionId_relatedInstructionId: { instructionId: req.params.id, relatedInstructionId } },
      create: { instructionId: req.params.id, relatedInstructionId, relationType: relationType || null, weight: typeof weight === 'number' ? weight : 1 },
      update: { relationType: relationType || null, ...(typeof weight === 'number' ? { weight } : {}) },
    });
    res.json({ link });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Редагування процесів ──────────────────────────────────
api.post('/companies/:id/processes', async (req, res) => {
  try {
    const { name } = req.body ?? {};
    const process = await prisma.process.create({
      data: { companyId: req.params.id, name: name || 'Новий процес', description: '', steps: [], diagram: null },
    });
    await logChange(req.params.id, 'process', 'create', `Створено процес: ${process.name}`, req.body?.author);
    res.json({ process });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.patch('/processes/:id', async (req, res) => {
  try {
    const { name, description, steps, graph } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (Array.isArray(steps)) {
      data.steps = steps;
      data.diagram = stepsToMermaid(steps); // перегенерувати діаграму з кроків
    }
    if (graph !== undefined) data.graph = graph; // візуальна схема (React Flow)
    const process = await prisma.process.update({ where: { id: req.params.id }, data });
    await logChange(process.companyId, 'process', 'update', `Оновлено процес: ${process.name}`, req.body?.author);
    res.json({ process });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.delete('/processes/:id', async (req, res) => {
  try {
    const p = await prisma.process.findUnique({ where: { id: req.params.id }, select: { companyId: true, name: true } });
    await prisma.process.delete({ where: { id: req.params.id } });
    if (p) await logChange(p.companyId, 'process', 'delete', `Видалено процес: ${p.name}`, req.body?.author);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Статистики по ЦКП ─────────────────────────────────────
api.get('/companies/:id/statistics', async (req, res) => {
  try {
    const statistics = await prisma.statistic.findMany({
      where: { companyId: req.params.id },
      include: { orgUnit: { select: { id: true, name: true, type: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ statistics });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.post('/companies/:id/statistics', async (req, res) => {
  try {
    const { orgUnitId, name, unit, higherIsBetter } = req.body ?? {};
    if (!orgUnitId || !name) return res.status(400).json({ error: 'orgUnitId і name обовʼязкові' });
    const statistic = await prisma.statistic.create({
      data: { companyId: req.params.id, orgUnitId, name, unit: unit || null, higherIsBetter: higherIsBetter !== false, points: [] },
      include: { orgUnit: { select: { id: true, name: true, type: true } } },
    });
    await logChange(req.params.id, 'structure', 'create', `Додано статистику «${name}»`, req.body?.author);
    res.json({ statistic });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.patch('/statistics/:id', async (req, res) => {
  try {
    const { name, unit, higherIsBetter, points } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (unit !== undefined) data.unit = unit || null;
    if (higherIsBetter !== undefined) data.higherIsBetter = higherIsBetter;
    if (Array.isArray(points)) data.points = points;
    const statistic = await prisma.statistic.update({
      where: { id: req.params.id }, data,
      include: { orgUnit: { select: { id: true, name: true, type: true } } },
    });
    res.json({ statistic });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Додати точку до ряду (для бота/швидкого вводу)
api.post('/statistics/:id/points', async (req, res) => {
  try {
    const { date, value } = req.body ?? {};
    if (value === undefined || value === null || Number.isNaN(Number(value))) return res.status(400).json({ error: 'value має бути числом' });
    const cur = await prisma.statistic.findUnique({ where: { id: req.params.id } });
    if (!cur) return res.status(404).json({ error: 'not found' });
    const d = (date && String(date)) || new Date().toISOString().slice(0, 10);
    const points = Array.isArray(cur.points) ? (cur.points as { date: string; value: number }[]) : [];
    const filtered = points.filter((p) => p.date !== d); // одна точка на дату
    filtered.push({ date: d, value: Number(value) });
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    const statistic = await prisma.statistic.update({
      where: { id: req.params.id }, data: { points: filtered },
      include: { orgUnit: { select: { id: true, name: true, type: true } } },
    });
    res.json({ statistic });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.delete('/statistics/:id', async (req, res) => {
  try {
    const s = await prisma.statistic.findUnique({ where: { id: req.params.id }, select: { companyId: true, name: true } });
    await prisma.statistic.delete({ where: { id: req.params.id } });
    if (s) await logChange(s.companyId, 'structure', 'delete', `Видалено статистику «${s.name}»`, req.body?.author);
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
