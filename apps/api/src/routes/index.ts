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
        select: { id: true, firstName: true, lastName: true, _count: { select: { posts: true } } },
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
      prisma.member.findMany({ where: { companyId }, select: { _count: { select: { posts: true } } } }),
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
