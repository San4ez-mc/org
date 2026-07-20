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
async function logChange(companyId: string, entity: string, action: string, summary: string, author?: string, unitId?: string) {
  try {
    await prisma.changeLog.create({ data: { companyId, entity, action, summary, author: author || 'пульт', unitId: unitId ?? null } });
  } catch {
    /* ignore */
  }
}

/** #192 Створити сповіщення (доставка — через спільний примітив надсилання, G5). */
async function notify(companyId: string, type: string, message: string, targetMemberId?: string) {
  try {
    await prisma.orgNotification.create({ data: { companyId, type, message, targetMemberId: targetMemberId ?? null } });
    // TODO(G5): доставити через спільний send-примітив (SMTP + Telegram-send за токеном).
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
        members: { include: { posts: { where: { removedAt: null }, include: { postUnit: { select: { id: true, name: true } } } } }, orderBy: { createdAt: 'asc' } },
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

// #213 Стратегічний шар + #219 материнська/дочірні + #200 Drive — оновлення компанії
api.patch('/companies/:id', async (req, res) => {
  try {
    const { name, abbr, mission, companyCkp, idealPicture, parentCompanyId, driveRootFolderId, orgSheetId, adizesStage } = req.body ?? {};
    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(abbr !== undefined && { abbr: abbr || null }),
        ...(mission !== undefined && { mission: mission || null }),
        ...(companyCkp !== undefined && { companyCkp: companyCkp || null }),
        ...(idealPicture !== undefined && { idealPicture: idealPicture || null }),
        ...(adizesStage !== undefined && { adizesStage: adizesStage || null }),
        ...(parentCompanyId !== undefined && { parentCompanyId: parentCompanyId || null }),
        ...(driveRootFolderId !== undefined && { driveRootFolderId: driveRootFolderId || null }),
        ...(orgSheetId !== undefined && { orgSheetId: orgSheetId || null }),
      },
    });
    await logChange(company.id, 'structure', 'update', 'Оновлено профіль/стратегію компанії', req.body?.author);
    res.json({ company });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #219 Дочірні структури компанії
api.get('/companies/:id/sub-companies', async (req, res) => {
  try {
    const subCompanies = await prisma.company.findMany({ where: { parentCompanyId: req.params.id }, select: { id: true, name: true, abbr: true } });
    res.json({ subCompanies });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #215 Власники та інвестори з долями
api.get('/companies/:id/owners', async (req, res) => {
  try {
    const owners = await prisma.owner.findMany({ where: { companyId: req.params.id }, orderBy: { sharePct: 'desc' } });
    const totalShare = owners.reduce((s, o) => s + (o.sharePct || 0), 0);
    res.json({ owners, totalShare });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
api.post('/companies/:id/owners', async (req, res) => {
  try {
    const { name, kind, sharePct, note } = req.body ?? {};
    if (!name) return void res.status(400).json({ error: 'name обовʼязковий' });
    const owner = await prisma.owner.create({
      data: { companyId: req.params.id, name, kind: kind === 'INVESTOR' ? 'INVESTOR' : 'OWNER', sharePct: Number(sharePct) || 0, note: note || null },
    });
    res.json({ owner });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
api.patch('/owners/:id', async (req, res) => {
  try {
    const { name, kind, sharePct, note } = req.body ?? {};
    const owner = await prisma.owner.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(kind !== undefined && { kind: kind === 'INVESTOR' ? 'INVESTOR' : 'OWNER' }),
        ...(sharePct !== undefined && { sharePct: Number(sharePct) || 0 }),
        ...(note !== undefined && { note: note || null }),
      },
    });
    res.json({ owner });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
api.delete('/owners/:id', async (req, res) => {
  try {
    await prisma.owner.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #202 Показник опису процесів (% деталізації)
api.get('/companies/:id/process-detail', async (req, res) => {
  try {
    const processes = await prisma.process.findMany({ where: { companyId: req.params.id }, select: { id: true, name: true, steps: true, graph: true } });
    const detail = processes.map((p) => {
      const steps = Array.isArray(p.steps) ? (p.steps as { action?: string; result?: string }[]) : [];
      const filledSteps = steps.filter((s) => (s?.action || '').trim() !== '' && (s?.result || '').trim() !== '').length;
      const g = p.graph as { nodes?: unknown[] } | null;
      const hasGraph = !!(g && Array.isArray(g.nodes) && g.nodes.length);
      const detailPct = steps.length ? Math.round((filledSteps / steps.length) * 100) : (hasGraph ? 50 : 0);
      return { id: p.id, name: p.name, steps: steps.length, filledSteps, hasGraph, detailPct };
    });
    const overallDetailPct = detail.length ? Math.round(detail.reduce((s, d) => s + d.detailPct, 0) / detail.length) : 0;
    res.json({ processes: detail, overallDetailPct });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #199 Володіння даними: повний експорт компанії (JSON)
api.get('/companies/:id/export', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        orgUnits: true,
        members: { include: { posts: true } },
        processes: true,
        instructions: true,
        owners: true,
        statistics: true,
        changes: { take: 500, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!company) return void res.status(404).json({ error: 'Компанію не знайдено' });
    res.setHeader('Content-Disposition', `attachment; filename="company-${req.params.id}.json"`);
    res.json({ exportedAt: new Date().toISOString(), company });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #205 Генерація тексту вакансії (детермінований шаблон з ЦКП посади)
api.post('/org-units/:id/vacancy-draft', async (req, res) => {
  try {
    const unit = await prisma.orgUnit.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, ckp: true, type: true, companyId: true } });
    if (!unit) return void res.status(404).json({ error: 'Посаду не знайдено' });
    if (unit.type !== 'POST') return void res.status(422).json({ error: 'Вакансія лише для посади (POST)' });
    const company = await prisma.company.findUnique({ where: { id: unit.companyId }, select: { name: true } });
    const nl = '\n';
    const draft =
      `Вакансія: ${unit.name}${company?.name ? ` — ${company.name}` : ''}${nl}${nl}` +
      `Головний результат посади (ЦКП): ${unit.ckp || '— (спершу задайте ЦКП посади)'}${nl}${nl}` +
      `Що робити: ${nl}- (виводиться з кроків процесів посади)${nl}${nl}` +
      `Що пропонуємо: — (заповнити: умови, оплата, графік)${nl}` +
      `Як відгукнутись: — (заповнити контакт/бот)${nl}`;
    res.json({ title: `Вакансія: ${unit.name}`, draft });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #193 Глобальний пошук по всьому (люди / посади / процеси / інструкції)
api.get('/companies/:id/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return void res.json({ query: q, results: { members: [], units: [], processes: [], instructions: [] } });
    const companyId = req.params.id;
    const [members, units, processes, instructions] = await Promise.all([
      prisma.member.findMany({ where: { companyId }, select: { id: true, firstName: true, lastName: true, email: true } }),
      prisma.orgUnit.findMany({ where: { companyId }, select: { id: true, name: true, ckp: true, type: true } }),
      prisma.process.findMany({ where: { companyId }, select: { id: true, name: true, description: true } }),
      prisma.instruction.findMany({ where: { companyId }, select: { id: true, title: true } }),
    ]);
    const inc = (s?: string | null) => !!s && s.toLowerCase().includes(q);
    res.json({
      query: q,
      results: {
        members: members.filter((m) => inc(`${m.firstName} ${m.lastName || ''}`) || inc(m.email)).slice(0, 20).map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName || ''}`.trim() })),
        units: units.filter((u) => inc(u.name) || inc(u.ckp)).slice(0, 20).map((u) => ({ id: u.id, name: u.name, type: u.type })),
        processes: processes.filter((p) => inc(p.name) || inc(p.description)).slice(0, 20).map((p) => ({ id: p.id, name: p.name })),
        instructions: instructions.filter((i) => inc(i.title)).slice(0, 20).map((i) => ({ id: i.id, title: i.title })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #230 Зведений дашборд трендів статистик
api.get('/companies/:id/statistics-summary', async (req, res) => {
  try {
    const stats = await prisma.statistic.findMany({ where: { companyId: req.params.id }, include: { orgUnit: { select: { id: true, name: true } } } });
    const summary = stats.map((s) => {
      const points = Array.isArray(s.points) ? (s.points as { date?: string; value?: number }[]) : [];
      const sorted = [...points].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const last = sorted.length ? Number(sorted[sorted.length - 1].value) || 0 : 0;
      const prev = sorted.length > 1 ? Number(sorted[sorted.length - 2].value) || 0 : 0;
      const delta = last - prev;
      const good = (delta > 0) === s.higherIsBetter;
      const trend = delta === 0 ? 'flat' : good ? 'good' : 'bad';
      return { id: s.id, name: s.name, unit: s.unit, orgUnit: s.orgUnit, last, prev, delta, trend, pointsCount: sorted.length };
    });
    res.json({ statistics: summary });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #194 Бібліотека шаблонів (процеси/інструкції/структури)
api.get('/companies/:id/templates', async (req, res) => {
  try {
    const templates = await prisma.template.findMany({ where: { companyId: req.params.id }, orderBy: { createdAt: 'desc' } });
    res.json({ templates });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.post('/companies/:id/templates', async (req, res) => {
  try {
    const { kind, name, industry, content } = req.body ?? {};
    if (!name) return void res.status(400).json({ error: 'name обовʼязковий' });
    const template = await prisma.template.create({ data: { companyId: req.params.id, kind: kind || 'process', name, industry: industry || null, content: content ?? {} } });
    res.json({ template });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.delete('/templates/:id', async (req, res) => {
  try { await prisma.template.delete({ where: { id: req.params.id } }); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #197 Кадрові накази / політики
api.get('/companies/:id/policies', async (req, res) => {
  try {
    const policies = await prisma.policy.findMany({ where: { companyId: req.params.id }, orderBy: { createdAt: 'desc' } });
    res.json({ policies });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.post('/companies/:id/policies', async (req, res) => {
  try {
    const { title, body, kind, effectiveDate } = req.body ?? {};
    if (!title || !body) return void res.status(400).json({ error: 'title і body обовʼязкові' });
    const policy = await prisma.policy.create({ data: { companyId: req.params.id, title, body, kind: kind === 'order' ? 'order' : 'policy', effectiveDate: effectiveDate ? new Date(effectiveDate) : null } });
    res.json({ policy });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.delete('/policies/:id', async (req, res) => {
  try { await prisma.policy.delete({ where: { id: req.params.id } }); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #220 Історія версій орг-одиниці (з журналу змін за unitId)
api.get('/org-units/:id/history', async (req, res) => {
  try {
    const history = await prisma.changeLog.findMany({ where: { unitId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, summary: true, author: true, createdAt: true } });
    res.json({ history });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #212 Облік навчання й тестування
api.get('/companies/:id/trainings', async (req, res) => {
  try {
    const trainings = await prisma.training.findMany({ where: { companyId: req.params.id }, orderBy: { createdAt: 'desc' } });
    const results = await prisma.trainingResult.findMany({ where: { trainingId: { in: trainings.map((t) => t.id) } } });
    res.json({ trainings, results });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.post('/companies/:id/trainings', async (req, res) => {
  try {
    const { title, description, instructionId } = req.body ?? {};
    if (!title) return void res.status(400).json({ error: 'title обовʼязковий' });
    const training = await prisma.training.create({ data: { companyId: req.params.id, title, description: description || null, instructionId: instructionId || null } });
    res.json({ training });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.post('/trainings/:id/results', async (req, res) => {
  try {
    const { memberId, score, passed } = req.body ?? {};
    if (!memberId) return void res.status(400).json({ error: 'memberId обовʼязковий' });
    const result = await prisma.trainingResult.upsert({
      where: { trainingId_memberId: { trainingId: req.params.id, memberId } },
      create: { trainingId: req.params.id, memberId, score: score != null ? Number(score) : null, passedAt: passed ? new Date() : null },
      update: { ...(score != null && { score: Number(score) }), passedAt: passed ? new Date() : null },
    });
    res.json({ result });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #206 Онбординг працівника: інструкції посад + навчання, які треба пройти
api.get('/members/:id/onboarding', async (req, res) => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id }, select: { id: true, companyId: true, posts: { where: { removedAt: null }, select: { postUnitId: true } } } });
    if (!member) return void res.status(404).json({ error: 'Працівника не знайдено' });
    const postIds = member.posts.map((p) => p.postUnitId);
    const [instructions, trainings, done] = await Promise.all([
      prisma.instruction.findMany({ where: { companyId: member.companyId, postUnitId: { in: postIds } }, select: { id: true, title: true, driveDocId: true } }),
      prisma.training.findMany({ where: { companyId: member.companyId }, select: { id: true, title: true, instructionId: true } }),
      prisma.trainingResult.findMany({ where: { memberId: member.id }, select: { trainingId: true, passedAt: true } }),
    ]);
    const passedSet = new Set(done.filter((d) => d.passedAt).map((d) => d.trainingId));
    res.json({
      instructionsToRead: instructions,
      trainings: trainings.map((t) => ({ id: t.id, title: t.title, instructionId: t.instructionId, passed: passedSet.has(t.id) })),
      completed: trainings.length > 0 && trainings.every((t) => passedSet.has(t.id)),
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #198 Вартість оргструктури (ФОП по відділеннях + планування найму)
api.get('/companies/:id/payroll', async (req, res) => {
  try {
    const companyId = req.params.id;
    const units = await prisma.orgUnit.findMany({
      where: { companyId },
      select: { id: true, name: true, type: true, parentId: true, boardNo: true, salary: true, isVacant: true, _count: { select: { memberPosts: { where: { removedAt: null } } } } },
    });
    const byId = new Map(units.map((u) => [u.id, u]));
    // Знайти відділення (DIVISION) — корінь ланцюга parent
    const divisionOf = (u: (typeof units)[number]): string | null => {
      let cur: (typeof units)[number] | undefined = u;
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (cur.type === 'DIVISION') return cur.name;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return null;
    };
    const posts = units.filter((u) => u.type === 'POST');
    const divTotals: Record<string, { filled: number; planned: number }> = {};
    let filledTotal = 0;
    let plannedTotal = 0; // вартість вакансій, які планується заповнити
    for (const p of posts) {
      const div = divisionOf(p) || '— (без відділення)';
      divTotals[div] = divTotals[div] || { filled: 0, planned: 0 };
      const cost = p.salary || 0;
      const vacant = p.isVacant || p._count.memberPosts === 0;
      if (vacant) { divTotals[div].planned += cost; plannedTotal += cost; }
      else { divTotals[div].filled += cost; filledTotal += cost; }
    }
    res.json({
      byDivision: Object.entries(divTotals).map(([division, v]) => ({ division, filledCost: v.filled, plannedCost: v.planned, total: v.filled + v.planned })),
      currentPayroll: filledTotal, // ФОП чинний
      plannedHiringCost: plannedTotal, // додатковий ФОП при заповненні вакансій
      projectedPayroll: filledTotal + plannedTotal,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #226 Ознайомлення/підпис інструкції
api.post('/instruction-records/:id/acknowledge', async (req, res) => {
  try {
    const { memberId } = req.body ?? {};
    if (!memberId) return void res.status(400).json({ error: 'memberId обовʼязковий' });
    const ack = await prisma.instructionAck.upsert({
      where: { instructionId_memberId: { instructionId: req.params.id, memberId } },
      create: { instructionId: req.params.id, memberId },
      update: {},
    });
    res.json({ ack });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.get('/instruction-records/:id/acknowledgements', async (req, res) => {
  try {
    const acks = await prisma.instructionAck.findMany({ where: { instructionId: req.params.id }, orderBy: { acknowledgedAt: 'desc' } });
    const members = await prisma.member.findMany({ where: { id: { in: acks.map((a) => a.memberId) } }, select: { id: true, firstName: true, lastName: true } });
    const nameById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName || ''}`.trim()]));
    res.json({ acknowledgements: acks.map((a) => ({ memberId: a.memberId, name: nameById.get(a.memberId) || a.memberId, acknowledgedAt: a.acknowledgedAt })) });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #195 Портфель клієнтів (супер-адмін): усі компанії з показниками
api.get('/portfolio', async (_req, res) => {
  try {
    const companies = await prisma.company.findMany({ select: { id: true, name: true, abbr: true, createdAt: true, adizesStage: true } });
    const rows = await Promise.all(companies.map(async (c) => {
      const [units, members, processes, pendingApprovals, vacancies] = await Promise.all([
        prisma.orgUnit.count({ where: { companyId: c.id } }),
        prisma.member.count({ where: { companyId: c.id, status: 'EMPLOYED' } }),
        prisma.process.count({ where: { companyId: c.id } }),
        prisma.proposal.count({ where: { companyId: c.id, status: 'PENDING' } }),
        prisma.orgUnit.count({ where: { companyId: c.id, type: 'POST', isVacant: true } }),
      ]);
      return { ...c, units, members, processes, pendingApprovals, vacancies };
    }));
    res.json({ companies: rows });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #196 Рекрутинг-воронка: кандидати на вакансію
api.get('/companies/:id/candidates', async (req, res) => {
  try { res.json({ candidates: await prisma.candidate.findMany({ where: { companyId: req.params.id }, orderBy: { createdAt: 'desc' } }) }); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});
api.post('/companies/:id/candidates', async (req, res) => {
  try {
    const { name, contact, vacancyUnitId, aiScore, notes } = req.body ?? {};
    if (!name) return void res.status(400).json({ error: 'name обовʼязковий' });
    const candidate = await prisma.candidate.create({ data: { companyId: req.params.id, name, contact: contact || null, vacancyUnitId: vacancyUnitId || null, aiScore: aiScore != null ? Number(aiScore) : null, notes: notes || null } });
    await notify(req.params.id, 'vacancy', `Новий кандидат: ${name}`);
    res.json({ candidate });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.patch('/candidates/:id', async (req, res) => {
  try {
    const { status, aiScore, notes, contact } = req.body ?? {};
    const candidate = await prisma.candidate.update({ where: { id: req.params.id }, data: {
      ...(status !== undefined && { status: String(status) }),
      ...(aiScore !== undefined && { aiScore: aiScore != null ? Number(aiScore) : null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(contact !== undefined && { contact: contact || null }),
    } });
    res.json({ candidate });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #207 Цільова структура за етапом Адізеса (rule-based підказка)
api.get('/companies/:id/adizes-target', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { adizesStage: true } });
    const stage = (company?.adizesStage || '').toLowerCase();
    const map: Record<string, { focus: string; strengthen: string[] }> = {
      courtship: { focus: 'ідея і відданість', strengthen: ['Адміністративне (мінімум)', 'Розповсюдження (тест ринку)'] },
      infancy: { focus: 'продажі і виживання', strengthen: ['Розповсюдження', 'Фінансове (кеш)'] },
      'go-go': { focus: 'ріст, ризик розпорошення', strengthen: ['Адміністративне', 'Технічне/Виробництво'] },
      adolescence: { focus: 'системи і делегування', strengthen: ['Адміністративне', 'Персоналу/Побудови', 'Фінансове'] },
      prime: { focus: 'баланс P-A-E-I', strengthen: ['Кваліфікації', 'По роботі з публікою'] },
    };
    const rec = map[stage] || { focus: 'визначити етап (adizesStage)', strengthen: [] };
    res.json({ stage: company?.adizesStage || null, focus: rec.focus, strengthenDivisions: rec.strengthen });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #208 Аналіз структури/процесів (rule-based: слабкі місця + рекомендації за Адізесом)
api.get('/companies/:id/analysis', async (req, res) => {
  try {
    const companyId = req.params.id;
    const [posts, divisions, processes, members] = await Promise.all([
      prisma.orgUnit.findMany({ where: { companyId, type: 'POST' }, select: { ckp: true, isVacant: true, _count: { select: { memberPosts: { where: { removedAt: null } } } } } }),
      prisma.orgUnit.findMany({ where: { companyId, type: 'DIVISION' }, select: { ckp: true } }),
      prisma.process.findMany({ where: { companyId }, select: { steps: true } }),
      prisma.member.findMany({ where: { companyId, status: 'EMPLOYED' }, select: { _count: { select: { posts: { where: { removedAt: null } } } } } }),
    ]);
    const findings: { severity: 'high' | 'medium' | 'low'; issue: string; recommendation: string }[] = [];
    const postsNoCkp = posts.filter((p) => !p.ckp || p.ckp.trim() === '').length;
    if (postsNoCkp) findings.push({ severity: 'high', issue: `${postsNoCkp} посад без ЦКП`, recommendation: 'Задати ЦКП кожній посаді (Адізес: слабке P — незрозумілий продукт).' });
    const divNoCkp = divisions.filter((d) => !d.ckp || d.ckp.trim() === '').length;
    if (divNoCkp) findings.push({ severity: 'medium', issue: `${divNoCkp} відділень без ЦКП`, recommendation: 'Визначити ЦКП відділень.' });
    const vacant = posts.filter((p) => p.isVacant || p._count.memberPosts === 0).length;
    if (vacant) findings.push({ severity: 'medium', issue: `${vacant} вакантних посад`, recommendation: 'Запустити рекрутинг-воронку (#196).' });
    const overloaded = members.filter((m) => m._count.posts >= 3).length;
    if (overloaded) findings.push({ severity: 'high', issue: `${overloaded} людей на 3+ посадах`, recommendation: 'Перевантаження ("власник — вузьке місце") — делегувати/наймати.' });
    const undescribed = processes.filter((p) => !Array.isArray(p.steps) || (p.steps as unknown[]).length === 0).length;
    if (undescribed) findings.push({ severity: 'low', issue: `${undescribed} процесів без кроків`, recommendation: 'Описати кроки — база для інструкцій і навчання.' });
    if (divisions.length < 7) findings.push({ severity: 'low', issue: `Задіяно ${divisions.length}/7 відділень`, recommendation: 'Перевірити, чи всі 7 функцій закриті.' });
    const score = Math.max(0, 100 - findings.reduce((s, f) => s + (f.severity === 'high' ? 20 : f.severity === 'medium' ? 10 : 5), 0));
    res.json({ findings, score });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// #192 Сповіщення
api.get('/companies/:id/notifications', async (req, res) => {
  try {
    const notifications = await prisma.orgNotification.findMany({ where: { companyId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ notifications, unread: notifications.filter((n) => !n.read).length });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
api.post('/notifications/:id/read', async (req, res) => {
  try { await prisma.orgNotification.update({ where: { id: req.params.id }, data: { read: true } }); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: String(err) }); }
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
    const { firstName, lastName, telegramUserId, telegramUsername, email, birthDate, photoUrl, role, hireDate, status, dismissedAt } = req.body ?? {};
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
        // #211 життєвий цикл
        ...(hireDate !== undefined && { hireDate: hireDate ? new Date(hireDate) : null }),
        ...(status !== undefined && { status: status === 'DISMISSED' ? 'DISMISSED' : 'EMPLOYED' }),
        ...(dismissedAt !== undefined && { dismissedAt: dismissedAt ? new Date(dismissedAt) : null }),
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
      update: { removedAt: null }, // #211 повторне призначення — «оживити» рядок
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

api.delete('/members/:id/posts/:postUnitId', async (req, res) => {
  try {
    // #211 soft-delete: лишаємо рядок з removedAt для історії посад
    await prisma.memberPost.updateMany({
      where: { memberId: req.params.id, postUnitId: req.params.postUnitId, removedAt: null },
      data: { removedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #211 Картка працівника: життєвий цикл + чинні й минулі посади
api.get('/members/:id/card', async (req, res) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, firstName: true, lastName: true, email: true, birthDate: true, photoUrl: true,
        role: true, hireDate: true, status: true, dismissedAt: true, createdAt: true,
        posts: {
          include: { postUnit: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!member) return void res.status(404).json({ error: 'Працівника не знайдено' });
    const toPost = (p: { postUnit: { id: string; name: string }; createdAt: Date; removedAt: Date | null }) => ({
      id: p.postUnit.id, name: p.postUnit.name, assignedAt: p.createdAt, removedAt: p.removedAt,
    });
    const currentPosts = member.posts.filter((p) => !p.removedAt).map(toPost);
    const pastPosts = member.posts.filter((p) => p.removedAt).map(toPost);
    const { posts, ...lifecycle } = member;
    void posts;
    res.json({ member: lifecycle, currentPosts, pastPosts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Портал працівника (персональна зведена інформація) ─────
type MemberWithPosts = { id: string; firstName: string; lastName: string | null; role: string; companyId: string; telegramUsername?: string | null; email?: string | null; birthDate?: Date | null; photoUrl?: string | null; posts: { postUnitId: string }[] };

async function buildMemberSummary(member: MemberWithPosts) {
  const postUnitIds = member.posts.map((p) => p.postUnitId);
  const units = await prisma.orgUnit.findMany({
    where: { id: { in: postUnitIds } },
    include: { parent: { include: { parent: { include: { parent: true } } } } },
  });
  const postNames = units.map((u) => u.name);
  const [company, statistics, instructions] = await Promise.all([
    prisma.company.findUnique({ where: { id: member.companyId }, include: { processes: { orderBy: { createdAt: 'asc' } } } }),
    prisma.statistic.findMany({ where: { orgUnitId: { in: postUnitIds } }, include: { orgUnit: { select: { id: true, name: true, type: true } } } }),
    // #225 інструкції посад працівника (зміст на Drive)
    prisma.instruction.findMany({ where: { postUnitId: { in: postUnitIds } }, select: { id: true, title: true, driveDocId: true, folderPath: true, status: true, postUnitId: true } }),
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

  // #238 Ролі: HEAD/OWNER бачать команду свого підрозділу (EMPLOYEE — лише себе).
  let team: { id: string; name: string; posts: string[] }[] = [];
  if (member.role === 'HEAD' || member.role === 'OWNER') {
    // підрозділи, якими керує ця людина = батьки її посад (відділ/відділення/секція)
    const deptIds = Array.from(new Set(
      units
        .map((u) => u.parent)
        .filter((p): p is NonNullable<typeof p> => !!p && ['DEPARTMENT', 'DIVISION', 'SECTION'].includes(p.type))
        .map((p) => p.id),
    ));
    if (deptIds.length) {
      const teamPosts = await prisma.orgUnit.findMany({ where: { companyId: member.companyId, type: 'POST', parentId: { in: deptIds } }, select: { id: true } });
      const teamPostIds = teamPosts.map((p) => p.id);
      if (teamPostIds.length) {
        const teamMembers = await prisma.member.findMany({
          where: { companyId: member.companyId, id: { not: member.id }, status: 'EMPLOYED', posts: { some: { postUnitId: { in: teamPostIds }, removedAt: null } } },
          select: { id: true, firstName: true, lastName: true, posts: { where: { removedAt: null, postUnitId: { in: teamPostIds } }, select: { postUnit: { select: { name: true } } } } },
        });
        team = teamMembers.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName ?? ''}`.trim(), posts: m.posts.map((p) => p.postUnit.name) }));
      }
    }
  }

  return {
    member: {
      id: member.id, firstName: member.firstName, lastName: member.lastName, role: member.role,
      telegramUsername: member.telegramUsername ?? null, email: member.email ?? null,
      birthDate: member.birthDate ? new Date(member.birthDate).toISOString().slice(0, 10) : null,
      photoUrl: member.photoUrl ?? null,
    },
    company: company ? { id: company.id, name: company.name } : null,
    posts: units.map((u) => ({ id: u.id, name: u.name, ckp: u.ckp, path: ancestors(u) })),
    processes: processes.map((pr) => ({ id: pr.id, name: pr.name, description: pr.description, steps: pr.steps })),
    statistics,
    instructions: instructions.map((i) => ({ id: i.id, title: i.title, driveDocId: i.driveDocId, folderPath: i.folderPath, status: i.status })),
    team,
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
    const member = await prisma.member.findUnique({ where: { accessToken: req.params.token }, include: { posts: { where: { removedAt: null } } } });
    if (!member) return res.status(404).json({ error: 'not found' });
    res.json({ summary: await buildMemberSummary(member) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #236 Самореєстрація: працівник оновлює ВЛАСНИЙ профіль за токеном.
// Дозволені лише self-поля (не роль/статус/посади — то тільки адмін через /members/:id).
api.patch('/me/:token', async (req, res) => {
  try {
    const member = await prisma.member.findUnique({ where: { accessToken: req.params.token }, select: { id: true } });
    if (!member) return void res.status(404).json({ error: 'not found' });
    const { firstName, lastName, telegramUsername, email, birthDate, photoUrl } = req.body ?? {};
    const updated = await prisma.member.update({
      where: { id: member.id },
      data: {
        ...(firstName !== undefined && String(firstName).trim() && { firstName: String(firstName).trim() }),
        ...(lastName !== undefined && { lastName: String(lastName).trim() || null }),
        ...(telegramUsername !== undefined && { telegramUsername: String(telegramUsername).trim().replace(/^@/, '') || null }),
        ...(email !== undefined && { email: String(email).trim() || null }),
        ...(birthDate !== undefined && { birthDate: birthDate ? new Date(birthDate) : null }),
        ...(photoUrl !== undefined && { photoUrl: String(photoUrl).trim() || null }),
      },
      include: { posts: { where: { removedAt: null } } },
    });
    res.json({ summary: await buildMemberSummary(updated) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Зведення для працівника за Telegram id (для бота-самообслуговування)
api.get('/members/by-telegram/:tgId', async (req, res) => {
  try {
    const member = await prisma.member.findFirst({ where: { telegramUserId: req.params.tgId }, include: { posts: { where: { removedAt: null } } } });
    if (!member) return res.status(404).json({ error: 'not found' });
    res.json({ summary: await buildMemberSummary(member) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Редагування орг-одиниць ───────────────────────────────
api.patch('/org-units/:id', async (req, res) => {
  try {
    const { name, ckp, unitStatus, salary, parentId } = req.body ?? {};
    const validStatus = ['CURRENT', 'PLANNED', 'TESTING', 'DEPRECATED'];

    // #218 Переміщення (drag&drop): зміна батька. Новий батько має бути в тій самій
    // компанії й не самим вузлом (щоб уникнути циклів у простому випадку — POST не має дітей).
    let moveData: { parentId?: string } = {};
    if (parentId !== undefined && parentId !== null) {
      const current = await prisma.orgUnit.findUnique({ where: { id: req.params.id }, select: { companyId: true, id: true } });
      const parent = await prisma.orgUnit.findUnique({ where: { id: String(parentId) }, select: { companyId: true, id: true } });
      if (!current || !parent || parent.companyId !== current.companyId) {
        return void res.status(400).json({ error: 'Некоректний новий підрозділ' });
      }
      if (parent.id === current.id) return void res.status(422).json({ error: 'Не можна перемістити у себе' });
      moveData = { parentId: parent.id };
    }

    const unit = await prisma.orgUnit.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(ckp !== undefined && { ckp }),
        ...(unitStatus !== undefined && validStatus.includes(unitStatus) && { unitStatus }), // #217
        ...(salary !== undefined && { salary: salary === null || salary === '' ? null : Number(salary) }), // #198
        ...moveData,
      },
    });
    const changeMsg = moveData.parentId ? `Переміщено «${unit.name}» в інший підрозділ` : `Оновлено «${unit.name}»${ckp !== undefined ? ' (ЦКП)' : ''}`;
    await logChange(unit.companyId, 'structure', 'update', changeMsg, req.body?.author, unit.id);
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
    await logChange(req.params.id, 'structure', 'create', `Додано ${type === 'DEPARTMENT' ? 'відділ' : 'посаду'}: ${name}`, req.body?.author, unit.id);
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
    if (unit) await logChange(unit.companyId, 'structure', 'delete', `Видалено: ${unit.name}`, req.body?.author, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #204 Генерація чернетки посадової інструкції з ЦКП + кроків процесів посади.
// Детермінована збірка (правила — INSTRUCTION_RULES.md); зміст лягає на Drive (#276).
api.post('/org-units/:id/instruction-draft', async (req, res) => {
  try {
    const unit = await prisma.orgUnit.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, ckp: true, companyId: true, type: true, reportsTo: { select: { name: true } } },
    });
    if (!unit) return void res.status(404).json({ error: 'Посаду не знайдено' });
    if (unit.type !== 'POST') return void res.status(422).json({ error: 'Інструкція генерується лише для посади (POST)' });
    if (!unit.ckp || unit.ckp.trim() === '') return void res.status(422).json({ error: 'Спершу задайте ЦКП посади (без ЦКП інструкція не генерується).' });

    const processes = await prisma.process.findMany({ where: { companyId: unit.companyId }, select: { id: true, name: true, steps: true } });
    type Step = { postUnitId?: string; postTitle?: string; action?: string; result?: string };
    const duties: string[] = [];
    const involvedProcesses: { id: string; name: string }[] = [];
    for (const p of processes) {
      if (!Array.isArray(p.steps)) continue;
      const mine = (p.steps as Step[]).filter((s) => s?.postUnitId === unit.id || (!!s?.postTitle && s.postTitle === unit.name));
      if (!mine.length) continue;
      involvedProcesses.push({ id: p.id, name: p.name });
      for (const s of mine) {
        const action = (s.action || '').trim();
        const result = (s.result || '').trim();
        if (action || result) duties.push(`${action || '—'} → ${result || '—'} _(процес: ${p.name})_`);
      }
    }

    const nl = '\n';
    const draft =
      `# Посадова інструкція: ${unit.name}${nl}${nl}` +
      `**Підпорядкування:** ${unit.reportsTo?.name || '— (заповнити)'}${nl}${nl}` +
      `## ЦКП посади${nl}${unit.ckp}${nl}${nl}` +
      `## Обовʼязки${nl}` +
      (duties.length ? duties.map((d) => `- ${d}`).join(nl) : '- — (заповнити: посада ще не бере участі в жодному описаному процесі)') +
      `${nl}${nl}## Процеси, в яких бере участь${nl}` +
      (involvedProcesses.length ? involvedProcesses.map((p) => `- ${p.name}`).join(nl) : '- — (заповнити)') +
      `${nl}${nl}## Показники (статистики)${nl}- — (заповнити)${nl}${nl}## Права та доступи${nl}- — (заповнити)${nl}${nl}## Вимоги${nl}- — (заповнити)${nl}`;

    res.json({ title: `Посадова інструкція: ${unit.name}`, draft, involvedProcesses, dutiesCount: duties.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// #221 Процеси, в яких бере участь посада (звʼязок кроку з посадою за id, з fallback на назву).
api.get('/org-units/:id/processes', async (req, res) => {
  try {
    const unit = await prisma.orgUnit.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, companyId: true } });
    if (!unit) return void res.status(404).json({ error: 'Одиницю не знайдено' });
    const processes = await prisma.process.findMany({ where: { companyId: unit.companyId }, select: { id: true, name: true, steps: true } });
    const involved = processes.filter((p) =>
      Array.isArray(p.steps) &&
      (p.steps as { postUnitId?: string; postTitle?: string }[]).some(
        (s) => s?.postUnitId === unit.id || (!!s?.postTitle && s.postTitle === unit.name),
      ),
    );
    res.json({ processes: involved.map((p) => ({ id: p.id, name: p.name })) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Масовий імпорт даних (відділи / посади / люди) з CSV або рядків ──
// «Не лише через бота»: приймає { csv } (текст із заголовком) або { rows },
// dryRun=true — попередній перегляд без запису.
interface ImportRow {
  division?: string;
  department?: string;
  post?: string;
  ckp?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  telegramUsername?: string;
}

// Мінімальний, але коректний CSV-парсер (лапки, коми в лапках, CRLF).
function parseCsv(text: string): ImportRow[] {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); records.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip */ }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length < 2) return [];

  const alias: Record<string, keyof ImportRow> = {
    division: 'division', відділення: 'division',
    department: 'department', відділ: 'department',
    post: 'post', посада: 'post', позиція: 'post',
    ckp: 'ckp', цкп: 'ckp',
    firstname: 'firstName', first_name: 'firstName', імя: 'firstName', "ім'я": 'firstName', name: 'firstName',
    lastname: 'lastName', last_name: 'lastName', прізвище: 'lastName',
    email: 'email', пошта: 'email',
    telegram: 'telegramUsername', telegramusername: 'telegramUsername', телеграм: 'telegramUsername',
  };
  const header = nonEmpty[0].map((h) => alias[h.trim().toLowerCase()] ?? null);

  return nonEmpty.slice(1).map((cols) => {
    const r: ImportRow = {};
    header.forEach((key, idx) => {
      if (!key) return;
      const val = (cols[idx] ?? '').trim();
      if (val !== '') r[key] = val;
    });
    return r;
  });
}

api.post('/companies/:id/import', async (req, res) => {
  try {
    const companyId = req.params.id;
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return void res.status(404).json({ error: 'Компанію не знайдено' });

    const dryRun = Boolean(req.body?.dryRun);
    let rows: ImportRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length && typeof req.body?.csv === 'string') rows = parseCsv(req.body.csv);
    if (!rows.length) return void res.status(400).json({ error: 'Порожній імпорт: передайте rows[] або csv (з рядком-заголовком).' });

    const summary = {
      rows: rows.length,
      divisionsCreated: 0, departmentsCreated: 0, postsCreated: 0,
      membersCreated: 0, membersAssigned: 0, errors: [] as { row: number; error: string }[],
    };

    // Кеші «назва → id», щоб повтори в файлі не дублювались.
    const unitCache = new Map<string, string>();

    const findOrCreateUnit = async (
      type: 'DIVISION' | 'DEPARTMENT' | 'POST',
      name: string,
      parentId: string | null,
      ckp: string | null,
    ): Promise<string> => {
      const key = `${type}:${parentId ?? '-'}:${name.toLowerCase()}`;
      const cached = unitCache.get(key);
      if (cached) return cached;
      const existing = await prisma.orgUnit.findFirst({ where: { companyId, type, name }, select: { id: true } });
      if (existing) { unitCache.set(key, existing.id); return existing.id; }
      if (dryRun) {
        const tmp = `new:${key}`;
        unitCache.set(key, tmp);
        if (type === 'DIVISION') summary.divisionsCreated++;
        else if (type === 'DEPARTMENT') summary.departmentsCreated++;
        else summary.postsCreated++;
        return tmp;
      }
      const created = await prisma.orgUnit.create({ data: { companyId, type, name, parentId: parentId ?? null, ckp: ckp ?? null } });
      unitCache.set(key, created.id);
      if (type === 'DIVISION') summary.divisionsCreated++;
      else if (type === 'DEPARTMENT') summary.departmentsCreated++;
      else summary.postsCreated++;
      return created.id;
    };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        let divisionId: string | null = null;
        let departmentId: string | null = null;
        let postId: string | null = null;

        if (r.division) divisionId = await findOrCreateUnit('DIVISION', r.division, null, null);
        if (r.department) departmentId = await findOrCreateUnit('DEPARTMENT', r.department, divisionId, null);
        if (r.post) postId = await findOrCreateUnit('POST', r.post, departmentId ?? divisionId, r.ckp ?? null);

        if (r.firstName) {
          const email = r.email?.trim() || null;
          let memberId: string | null = null;
          const existingMember = email
            ? await prisma.member.findFirst({ where: { companyId, email }, select: { id: true } })
            : await prisma.member.findFirst({ where: { companyId, firstName: r.firstName, lastName: r.lastName ?? null }, select: { id: true } });

          if (existingMember) memberId = existingMember.id;
          else if (dryRun) { memberId = `new:member:${i}`; summary.membersCreated++; }
          else {
            const created = await prisma.member.create({
              data: {
                companyId, firstName: r.firstName, lastName: r.lastName || null,
                email, telegramUsername: r.telegramUsername || null, role: 'EMPLOYEE',
              },
              select: { id: true },
            });
            memberId = created.id;
            summary.membersCreated++;
          }

          if (postId && memberId && !dryRun && !postId.startsWith('new:') && !memberId.startsWith('new:')) {
            await prisma.memberPost.upsert({
              where: { memberId_postUnitId: { memberId, postUnitId: postId } },
              create: { memberId, postUnitId: postId },
              update: {},
            });
            summary.membersAssigned++;
          } else if (postId && memberId && dryRun) {
            summary.membersAssigned++;
          }
        }
      } catch (rowErr) {
        summary.errors.push({ row: i + 1, error: String(rowErr) });
      }
    }

    if (!dryRun && (summary.divisionsCreated + summary.departmentsCreated + summary.postsCreated + summary.membersCreated) > 0) {
      await logChange(companyId, 'structure', 'create',
        `Імпорт: +${summary.departmentsCreated} відділів, +${summary.postsCreated} посад, +${summary.membersCreated} людей`,
        req.body?.author);
    }

    res.json({ dryRun, summary });
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

    // #279 синхронність: змінились кроки → пропозиції оновити інструкції відповідальних посад.
    // #221: посада береться за id (postUnitId), з fallback на назву (postTitle).
    if (Array.isArray(steps)) {
      const typedSteps = steps as { postUnitId?: string; postTitle?: string }[];
      const stepPostIds = [...new Set(typedSteps.map((s) => (s?.postUnitId || '').trim()).filter((t) => t !== ''))];
      const postTitles = [...new Set(typedSteps.map((s) => (s?.postTitle || '').trim()).filter((t) => t !== ''))];
      if (stepPostIds.length || postTitles.length) {
        const posts = await prisma.orgUnit.findMany({
          where: {
            companyId: process.companyId,
            type: 'POST',
            OR: [{ id: { in: stepPostIds } }, { name: { in: postTitles } }],
          },
          select: { id: true },
        });
        const postIds = posts.map((p) => p.id);
        if (postIds.length) {
          const instructions = await prisma.instruction.findMany({
            where: { companyId: process.companyId, postUnitId: { in: postIds } },
            select: { id: true },
          });
          for (const instr of instructions) {
            await createProposal(
              process.companyId,
              'INSTRUCTION_EDIT',
              { reason: 'process_changed', processId: process.id, processName: process.name },
              instr.id,
              req.body?.author,
            );
          }
        }
      }
    }
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

// ── Діагностика «як є» (org-health аудит) ─────────────────
// Посади без ЦКП, % описаних процесів, вакансії, люди без посади.
api.get('/companies/:id/health', async (req, res) => {
  try {
    const companyId = req.params.id;
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      res.status(404).json({ error: 'Компанію не знайдено' });
      return;
    }

    const [posts, processes, members] = await Promise.all([
      prisma.orgUnit.findMany({
        where: { companyId, type: 'POST' },
        select: { id: true, name: true, ckp: true, isVacant: true, _count: { select: { memberPosts: true } } },
        orderBy: [{ boardNo: 'asc' }, { orderNo: 'asc' }],
      }),
      prisma.process.findMany({
        where: { companyId },
        select: { id: true, name: true, steps: true, diagram: true, graph: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.member.findMany({
        where: { companyId },
        select: { id: true, firstName: true, lastName: true, _count: { select: { posts: { where: { removedAt: null } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const isBlank = (v: string | null) => v === null || v.trim() === '';
    const postsWithoutCkp = posts.filter((p) => isBlank(p.ckp)).map((p) => ({ id: p.id, name: p.name }));
    const vacantPosts = posts
      .filter((p) => p.isVacant || p._count.memberPosts === 0)
      .map((p) => ({ id: p.id, name: p.name }));

    const processesDescribed = processes.filter((p) => {
      const hasSteps = Array.isArray(p.steps) && (p.steps as unknown[]).length > 0;
      const hasDiagram = typeof p.diagram === 'string' && p.diagram.trim() !== '';
      const g = p.graph as { nodes?: unknown[] } | null;
      const hasGraph = !!g && Array.isArray(g.nodes) && g.nodes.length > 0;
      return hasSteps || hasDiagram || hasGraph;
    }).length;

    const membersWithoutPost = members
      .filter((m) => m._count.posts === 0)
      .map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName || ''}`.trim() }));

    const processesTotal = processes.length;
    const health = {
      postsTotal: posts.length,
      postsWithoutCkp,
      postsWithoutCkpCount: postsWithoutCkp.length,
      vacantPosts,
      vacantPostsCount: vacantPosts.length,
      processesTotal,
      processesDescribed,
      processesDescribedPct: processesTotal > 0 ? Math.round((processesDescribed / processesTotal) * 100) : 0,
      membersWithoutPost,
      membersWithoutPostCount: membersWithoutPost.length,
    };
    res.json({ health });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Дашборд власника (health компанії) ────────────────────
// Заповнено/вакантно, % опису процесів, зміни за період, що чекає
// затвердження, вузькі місця.
api.get('/companies/:id/dashboard', async (req, res) => {
  try {
    const companyId = req.params.id;
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
    if (!company) {
      res.status(404).json({ error: 'Компанію не знайдено' });
      return;
    }

    const now = Date.now();
    const since7 = new Date(now - 7 * 86400000);
    const since30 = new Date(now - 30 * 86400000);

    const [posts, processes, members, changes7, changes30, pendingApprovals, recentChanges] = await Promise.all([
      prisma.orgUnit.findMany({
        where: { companyId, type: 'POST' },
        select: { id: true, name: true, ckp: true, isVacant: true, _count: { select: { memberPosts: true } } },
      }),
      prisma.process.findMany({ where: { companyId }, select: { steps: true, diagram: true, graph: true } }),
      prisma.member.findMany({ where: { companyId }, select: { _count: { select: { posts: { where: { removedAt: null } } } } } }),
      prisma.changeLog.count({ where: { companyId, createdAt: { gte: since7 } } }),
      prisma.changeLog.count({ where: { companyId, createdAt: { gte: since30 } } }),
      prisma.proposal.count({ where: { companyId, status: 'PENDING' } }),
      prisma.changeLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, entity: true, action: true, summary: true, author: true, createdAt: true } }),
    ]);

    const postsTotal = posts.length;
    const vacant = posts.filter((p) => p.isVacant || p._count.memberPosts === 0).length;
    const filled = postsTotal - vacant;
    const postsWithoutCkp = posts.filter((p) => p.ckp === null || p.ckp.trim() === '').length;

    const processesTotal = processes.length;
    const processesDescribed = processes.filter((p) => {
      const hasSteps = Array.isArray(p.steps) && (p.steps as unknown[]).length > 0;
      const hasDiagram = typeof p.diagram === 'string' && p.diagram.trim() !== '';
      const g = p.graph as { nodes?: unknown[] } | null;
      const hasGraph = !!g && Array.isArray(g.nodes) && g.nodes.length > 0;
      return hasSteps || hasDiagram || hasGraph;
    }).length;
    const processesUndescribed = processesTotal - processesDescribed;

    const membersWithoutPost = members.filter((m) => m._count.posts === 0).length;

    const bottlenecks: { label: string; count: number }[] = [];
    if (vacant > 0) bottlenecks.push({ label: 'вакантних посад', count: vacant });
    if (postsWithoutCkp > 0) bottlenecks.push({ label: 'посад без ЦКП', count: postsWithoutCkp });
    if (processesUndescribed > 0) bottlenecks.push({ label: 'процесів без опису', count: processesUndescribed });
    if (membersWithoutPost > 0) bottlenecks.push({ label: 'людей без посади', count: membersWithoutPost });
    if (pendingApprovals > 0) bottlenecks.push({ label: 'змін чекають затвердження', count: pendingApprovals });
    bottlenecks.sort((a, b) => b.count - a.count);

    const dashboard = {
      staffing: { postsTotal, filled, vacant, filledPct: postsTotal > 0 ? Math.round((filled / postsTotal) * 100) : 0 },
      processes: { total: processesTotal, described: processesDescribed, describedPct: processesTotal > 0 ? Math.round((processesDescribed / processesTotal) * 100) : 0 },
      changes: { last7d: changes7, last30d: changes30 },
      pendingApprovals,
      bottlenecks,
      recentChanges,
    };
    res.json({ dashboard });
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
    const p = await prisma.proposal.create({
      data: { companyId, type, payload: payload as object, targetInstructionId: targetInstructionId ?? null, createdBy: createdBy ?? null },
    });
    await notify(companyId, 'approval', 'Нова пропозиція змін очікує затвердження'); // #192
    return p;
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
