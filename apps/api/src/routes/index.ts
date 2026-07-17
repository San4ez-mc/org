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
    // #279 синхронність: нова посада → пропозиція створити для неї чернетку інструкції.
    if ((type || 'POST') === 'POST') {
      await createProposal(req.params.id, 'NEW_DOC', { postUnitId: unit.id, title: `Посадова інструкція: ${name}`, reason: 'new_post_created' }, null, req.body?.author);
    }
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
// ── Пропозиції змін (#223) + движок синхронної побудови (#279) ──
// Зміна однієї сутності (структура/процес/інструкція) → пропозиції правок повʼязаних.
// Людина підтверджує (approve застосовує зміну) або відхиляє.
async function createProposal(
  companyId: string,
  type: 'INSTRUCTION_EDIT' | 'NEW_DOC' | 'STRUCTURE_CHANGE',
  payload: Record<string, unknown>,
  targetInstructionId?: string | null,
  createdBy?: string,
) {
  try {
    return await prisma.proposal.create({
      data: { companyId, type, payload: payload as object, targetInstructionId: targetInstructionId ?? null, createdBy: createdBy ?? null },
    });
  } catch {
    return null;
  }
}

api.get('/companies/:id/proposals', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const proposals = await prisma.proposal.findMany({
      where: {
        companyId: req.params.id,
        ...(status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
      },
      include: { targetInstruction: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ proposals });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.post('/proposals/:id/approve', async (req, res) => {
  try {
    const p = await prisma.proposal.findUnique({ where: { id: req.params.id } });
    if (!p) return void res.status(404).json({ error: 'Пропозицію не знайдено' });
    if (p.status !== 'PENDING') return void res.status(409).json({ error: 'Пропозицію вже опрацьовано' });

    // Застосувати зміну: NEW_DOC зі вказаною посадою → створити чернетку інструкції
    let applied: { instructionId: string } | null = null;
    if (p.type === 'NEW_DOC') {
      const payload = (p.payload ?? {}) as { postUnitId?: string; title?: string };
      if (payload.postUnitId) {
        const instr = await prisma.instruction.create({
          data: { companyId: p.companyId, postUnitId: payload.postUnitId, title: payload.title || 'Посадова інструкція', status: 'DRAFT' },
        });
        applied = { instructionId: instr.id };
        await logChange(p.companyId, 'instruction', 'create', `Створено інструкцію (з пропозиції): ${instr.title}`, req.body?.author);
      }
    }

    await prisma.proposal.update({
      where: { id: p.id },
      data: { status: 'APPROVED', approvedBy: req.body?.approvedBy ?? null, decidedAt: new Date() },
    });
    res.json({ ok: true, applied });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.post('/proposals/:id/reject', async (req, res) => {
  try {
    const p = await prisma.proposal.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!p) return void res.status(404).json({ error: 'Пропозицію не знайдено' });
    if (p.status !== 'PENDING') return void res.status(409).json({ error: 'Пропозицію вже опрацьовано' });
    await prisma.proposal.update({
      where: { id: p.id },
      data: { status: 'REJECTED', approvedBy: req.body?.approvedBy ?? null, decidedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Розповсюдження зміни інструкції → пропозиції-ревʼю для повʼязаних (основа #224).
api.post('/instructions/:id/propagate', async (req, res) => {
  try {
    const instr = await prisma.instruction.findUnique({ where: { id: req.params.id }, select: { id: true, companyId: true, title: true } });
    if (!instr) return void res.status(404).json({ error: 'Інструкцію не знайдено' });
    const links = await prisma.instructionLink.findMany({
      where: { instructionId: instr.id },
      include: { related: { select: { id: true, title: true } } },
    });
    const created: { proposalId: string; relatedInstructionId: string; relatedTitle: string | undefined }[] = [];
    for (const l of links) {
      const prop = await createProposal(
        instr.companyId,
        'INSTRUCTION_EDIT',
        { reason: 'linked_instruction_changed', sourceInstructionId: instr.id, sourceTitle: instr.title, relationType: l.relationType },
        l.relatedInstructionId,
        req.body?.author,
      );
      if (prop) created.push({ proposalId: prop.id, relatedInstructionId: l.relatedInstructionId, relatedTitle: l.related?.title });
    }
    res.json({ propagated: created.length, proposals: created });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Завантаження документів через бот
api.post('/documents/ingest', notImplemented('documents.ingest'));

// Семантичний пошук
api.post('/search', notImplemented('search'));
