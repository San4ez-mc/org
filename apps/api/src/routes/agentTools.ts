import { Router } from 'express';
import { prisma } from '@platform/db';
import { listFolderTree } from '@platform/drive';

/**
 * Інструменти бота над орг-структурою. Змонтовано під /api/agent-tools —
 * авторизація успадковується від `api.use(requireApiSecret)`.
 *
 * Чому окремо від наявних REST-роутів: у них контракти під фронт (GET/PATCH,
 * параметри в шляху, важкі відповіді). Двигун Flows шле POST з аргументами
 * моделі в тілі, а сталий конфіг — у query. Тут — саме такий, рівний контракт.
 * Ці ж обробники потім стануть MCP-інструментами без переписування.
 */
export const agentTools = Router();

type Handler = (req: any, res: any) => Promise<unknown>;

const route =
  (fn: Handler): Handler =>
  async (req, res) => {
    try {
      return await fn(req, res);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const status = /обовʼязков|не знайдено|має бути/i.test(msg) ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  };

function param(req: any, field: string): any {
  return req.body?.[field] ?? req.query?.[field];
}

function need(req: any, field: string): string {
  const v = param(req, field);
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(`Поле "${field}" обовʼязкове`);
  }
  return String(v).trim();
}

// ── Читання структури ────────────────────────────────────────────────────────

/**
 * Компактне дерево орг-структури.
 * Свідомо НЕ використовуємо наявний /companies/:id/export — він тягне компанію
 * цілком разом із 500 записами журналу змін і рознесе контекст агента.
 */
agentTools.post(
  '/structure',
  route(async (req, res) => {
    const companyId = need(req, 'companyId');
    const q = param(req, 'query') ? String(param(req, 'query')).trim().toLowerCase() : '';

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) throw new Error('Компанію не знайдено');

    const units = await prisma.orgUnit.findMany({
      where: { companyId },
      select: {
        id: true, parentId: true, type: true, name: true, ckp: true,
        boardNo: true, holderName: true, isVacant: true, unitStatus: true,
        memberPosts: {
          where: { removedAt: null },
          select: { member: { select: { id: true, firstName: true, lastName: true, telegramUsername: true } } },
        },
      },
      orderBy: [{ boardNo: 'asc' }, { orderNo: 'asc' }],
    });

    const flat = units.map((u) => ({
      id: u.id,
      parentId: u.parentId,
      type: u.type,
      name: u.name,
      ckp: u.ckp,
      boardNo: u.boardNo,
      status: u.unitStatus,
      // Хто обіймає: спершу реальні призначення, інакше текстове поле посади.
      holders: u.memberPosts.length
        ? u.memberPosts.map((mp) => ({
            memberId: mp.member.id,
            name: [mp.member.firstName, mp.member.lastName].filter(Boolean).join(' '),
            telegram: mp.member.telegramUsername,
          }))
        : u.holderName
          ? [{ memberId: null, name: u.holderName, telegram: null }]
          : [],
      isVacant: u.isVacant,
    }));

    const filtered = q
      ? flat.filter((u) =>
          [u.name, u.ckp ?? '', ...u.holders.map((h) => h.name)]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : flat;

    res.json({
      company: company.name,
      companyId,
      total: flat.length,
      matched: filtered.length,
      units: filtered,
    });
  }),
);

// ── Створення і редагування посад ────────────────────────────────────────────

/** Записати зміну в журнал; не блокує основну дію. */
async function logChange(companyId: string, summary: string, unitId?: string, author?: string) {
  try {
    await prisma.changeLog.create({
      data: { companyId, entity: 'structure', action: 'agent', summary, author: author || 'бот-асистент', unitId: unitId ?? null },
    });
  } catch {
    /* журнал не критичний */
  }
}

/**
 * Створити посаду або відділ.
 * `parentId` обовʼязковий — структура завжди дерево, вільних вузлів не буває.
 */
agentTools.post(
  '/unit/create',
  route(async (req, res) => {
    const companyId = need(req, 'companyId');
    const name = need(req, 'name');
    // Порожня компанія — перший вузол стає коренем, чіплятись нема до чого.
    const unitsInCompany = await prisma.orgUnit.count({ where: { companyId } });
    const parentIdRaw = param(req, 'parentId');
    if (unitsInCompany > 0 && !parentIdRaw) {
      throw new Error('Поле "parentId" обовʼязкове — структура це дерево, вільних вузлів не буває');
    }
    const parentId = parentIdRaw ? String(parentIdRaw).trim() : null;
    const type = String(param(req, 'type') || 'POST').toUpperCase();
    if (!['POST', 'DEPARTMENT', 'DIVISION'].includes(type)) {
      throw new Error(`type має бути POST, DEPARTMENT або DIVISION, отримано «${type}»`);
    }

    if (parentId) {
      const parent = await prisma.orgUnit.findFirst({ where: { id: parentId, companyId }, select: { id: true } });
      if (!parent) throw new Error('Батьківський вузол не знайдено в цій компанії');
    }

    const unit = await prisma.orgUnit.create({
      data: {
        companyId,
        parentId,
        name,
        type: type as any,
        ckp: param(req, 'ckp') ? String(param(req, 'ckp')) : null,
        holderName: param(req, 'holderName') ? String(param(req, 'holderName')) : null,
        isVacant: param(req, 'holderName') ? false : true,
      },
      select: { id: true, name: true, type: true, ckp: true, parentId: true, isVacant: true },
    });

    await logChange(companyId, `Бот додав ${type === 'POST' ? 'посаду' : 'підрозділ'}: ${name}`, unit.id);
    res.json({ ok: true, unit });
  }),
);

/** Оновити наявну посаду або підрозділ. Передаються лише ті поля, які треба змінити. */
agentTools.post(
  '/unit/update',
  route(async (req, res) => {
    const companyId = need(req, 'companyId');
    const unitId = need(req, 'unitId');

    const existing = await prisma.orgUnit.findFirst({ where: { id: unitId, companyId }, select: { id: true, name: true } });
    if (!existing) throw new Error('Вузол не знайдено в цій компанії');

    const data: Record<string, unknown> = {};
    if (param(req, 'name') !== undefined) data.name = String(param(req, 'name'));
    if (param(req, 'ckp') !== undefined) data.ckp = String(param(req, 'ckp'));
    if (param(req, 'holderName') !== undefined) {
      const h = String(param(req, 'holderName')).trim();
      data.holderName = h || null;
      data.isVacant = !h;
    }
    if (param(req, 'parentId') !== undefined) {
      const newParent = String(param(req, 'parentId'));
      if (newParent === unitId) throw new Error('Вузол не може бути власним батьком');
      const p = await prisma.orgUnit.findFirst({ where: { id: newParent, companyId }, select: { id: true } });
      if (!p) throw new Error('Новий батьківський вузол не знайдено в цій компанії');
      data.parentId = newParent;
    }
    if (!Object.keys(data).length) throw new Error('Не передано жодного поля для оновлення');

    const unit = await prisma.orgUnit.update({
      where: { id: unitId },
      data,
      select: { id: true, name: true, type: true, ckp: true, parentId: true, holderName: true, isVacant: true },
    });

    await logChange(companyId, `Бот оновив «${existing.name}»: ${Object.keys(data).join(', ')}`, unitId);
    res.json({ ok: true, unit });
  }),
);

// ── Теки на Drive ────────────────────────────────────────────────────────────

/** Дерево тек компанії на Drive — щоб бот бачив, куди взагалі можна класти файли. */
agentTools.post(
  '/folder-tree',
  route(async (req, res) => {
    const companyId = need(req, 'companyId');
    const depth = Math.min(Math.max(Number(param(req, 'depth')) || 2, 1), 4);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, driveRootFolderId: true },
    });
    if (!company) throw new Error('Компанію не знайдено');
    if (!company.driveRootFolderId) {
      return res.json({ company: company.name, connected: false, note: 'Компанії ще не підключено теку на Drive.' });
    }

    const tree = await listFolderTree(company.driveRootFolderId, depth);
    // Віддаємо лише теки: файли бот шукає через drive_search, тут йому потрібна карта.
    const folders = (nodes: any[]): any[] =>
      nodes
        .filter((n) => n.isFolder)
        .map((n) => ({ id: n.id, name: n.name, children: folders(n.children ?? []) }));

    res.json({ company: company.name, connected: true, rootId: company.driveRootFolderId, tree: folders(tree) });
  }),
);
