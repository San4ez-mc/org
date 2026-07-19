// #277 — Стадійний сценарій інтервʼю орг-агента (Стадії 0–5).
// Кожен інтент інкрементально пише в БД і повертає коротке резюме + що далі.
// flows-воронка парсить відповіді користувача у структуру і кличе ці інтенти.
// Спец: INTERVIEW_PLAN.md. Drive — опційно (пишемо в БД навіть без Drive-кредів).
import { prisma } from '@platform/db';
import { CANONICAL_DIVISIONS } from '@platform/org-template';
import type { AgentContext, AgentResult } from './agent';

type Params = Record<string, unknown>;

const S = (v: unknown): string => (v == null ? '' : String(v)).trim();
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

// #279 Синхронність: створити PENDING-пропозицію (людина підтверджує inline).
async function fireProposal(
  companyId: string,
  type: 'INSTRUCTION_EDIT' | 'NEW_DOC' | 'STRUCTURE_CHANGE',
  payload: Record<string, unknown>,
  targetInstructionId?: string | null,
): Promise<boolean> {
  try {
    await prisma.proposal.create({
      data: { companyId, type, payload: payload as object, targetInstructionId: targetInstructionId ?? null },
    });
    return true;
  } catch {
    return false;
  }
}

/** Стадія 0 — власник, бачення, ЦКП компанії, власники. Створює/оновлює Company. */
async function interviewStart(p: Params, ctx: AgentContext): Promise<AgentResult> {
  const name = S(p.name) || 'Нова компанія';
  const data = {
    name,
    mission: S(p.mission) || null,
    companyCkp: S(p.companyCkp) || null,
    idealPicture: S(p.idealPicture) || null,
    adizesStage: S(p.adizesStage) || null,
  };

  let companyId = ctx.companyId;
  if (companyId) {
    await prisma.company.update({ where: { id: companyId }, data });
  } else {
    const c = await prisma.company.create({ data, select: { id: true } });
    companyId = c.id;
  }

  // Власники / інвестори
  const owners = arr(p.owners);
  let ownersCreated = 0;
  for (const o of owners) {
    const oName = S((o as Params).name);
    if (!oName) continue;
    const exists = await prisma.owner.findFirst({ where: { companyId, name: oName } });
    if (exists) continue;
    const kind = S((o as Params).kind).toUpperCase() === 'INVESTOR' ? 'INVESTOR' : 'OWNER';
    const sharePct = Number((o as Params).sharePct) || 0;
    await prisma.owner.create({ data: { companyId, name: oName, kind: kind as any, sharePct } });
    ownersCreated++;
  }

  return {
    companyId,
    reply: [
      `✅ Стадія 0 збережена: компанія «${name}».`,
      data.companyCkp ? `ЦКП компанії: ${data.companyCkp}` : '',
      ownersCreated ? `Власників/інвесторів додано: ${ownersCreated}.` : '',
      '',
      'Далі — Стадія 1: 7 відділень канонічного борду. Які напрями вже є де-факто і хто за них відповідає?',
    ].filter(Boolean).join('\n'),
  };
}

/** Стадія 1 — 7 канонічних відділень (ідемпотентно) + голови/ЦКП де вказано. */
async function interviewDivisions(p: Params, ctx: AgentContext): Promise<AgentResult> {
  const companyId = ctx.companyId || S(p.companyId);
  if (!companyId) return { reply: 'Спершу Стадія 0 — створимо компанію.' };

  const overrides = new Map<number, Params>();
  for (const d of arr(p.divisions)) {
    const bn = Number((d as Params).boardNo);
    if (bn) overrides.set(bn, d as Params);
  }

  let created = 0;
  for (const div of CANONICAL_DIVISIONS) {
    const ov = overrides.get(div.boardNo);
    let unit = await prisma.orgUnit.findFirst({
      where: { companyId, type: 'DIVISION', boardNo: div.boardNo },
      select: { id: true },
    });
    if (!unit) {
      unit = await prisma.orgUnit.create({
        data: {
          companyId, type: 'DIVISION', name: div.name, boardNo: div.boardNo,
          ckp: (ov && S(ov.ckp)) || div.ckp,
        },
        select: { id: true },
      });
      created++;
      // Голова відділення (посада)
      const leadName = ov ? S(ov.leadName) : '';
      await prisma.orgUnit.create({
        data: {
          companyId, parentId: unit.id, type: 'POST', name: 'Голова відділення',
          ckp: div.ckp, holderName: leadName || null, isVacant: !leadName,
        },
      });
    } else if (ov && S(ov.leadName)) {
      // Оновити голову існуючого відділення
      const head = await prisma.orgUnit.findFirst({
        where: { companyId, parentId: unit.id, type: 'POST', name: 'Голова відділення' },
        select: { id: true },
      });
      if (head) await prisma.orgUnit.update({ where: { id: head.id }, data: { holderName: S(ov.leadName), isVacant: false } });
    }
  }

  const total = await prisma.orgUnit.count({ where: { companyId, type: 'DIVISION' } });
  return {
    companyId,
    reply: [
      `✅ Стадія 1: борд із 7 відділень готовий (${total} шт., нових ${created}).`,
      'Далі — Стадія 2: відділи всередині відділень та їх ЦКП. З якого відділення почнемо?',
    ].join('\n'),
  };
}

/** Стадія 2 — відділи під відділеннями (за boardNo відділення). */
async function interviewDepartments(p: Params, ctx: AgentContext): Promise<AgentResult> {
  const companyId = ctx.companyId || S(p.companyId);
  if (!companyId) return { reply: 'Спершу Стадія 0.' };

  let created = 0;
  for (const d of arr(p.departments)) {
    const dp = d as Params;
    const divBoardNo = Number(dp.divisionBoardNo);
    const deptName = S(dp.name);
    if (!divBoardNo || !deptName) continue;
    const division = await prisma.orgUnit.findFirst({
      where: { companyId, type: 'DIVISION', boardNo: divBoardNo }, select: { id: true },
    });
    if (!division) continue;
    const exists = await prisma.orgUnit.findFirst({
      where: { companyId, parentId: division.id, type: 'DEPARTMENT', name: deptName }, select: { id: true },
    });
    if (exists) continue;
    const dept = await prisma.orgUnit.create({
      data: { companyId, parentId: division.id, type: 'DEPARTMENT', name: deptName, ckp: S(dp.ckp) || null },
      select: { id: true },
    });
    created++;
    const leadName = S(dp.leadName);
    await prisma.orgUnit.create({
      data: { companyId, parentId: dept.id, type: 'POST', name: 'Керівник відділу', ckp: S(dp.ckp) || null, holderName: leadName || null, isVacant: !leadName },
    });
  }

  return {
    companyId,
    reply: [`✅ Стадія 2: додано відділів — ${created}.`, 'Далі — Стадія 3: посади у відділах, їх ЦКП і хто обіймає.'].join('\n'),
  };
}

/** Стадія 3 — посади у відділах + люди (holderName, опційно Member+MemberPost). */
async function interviewPosts(p: Params, ctx: AgentContext): Promise<AgentResult> {
  const companyId = ctx.companyId || S(p.companyId);
  if (!companyId) return { reply: 'Спершу Стадія 0.' };

  let created = 0;
  let membersLinked = 0;
  let proposals = 0;
  for (const it of arr(p.posts)) {
    const ps = it as Params;
    const title = S(ps.title);
    const deptName = S(ps.departmentName);
    if (!title) continue;
    const dept = deptName
      ? await prisma.orgUnit.findFirst({ where: { companyId, type: { in: ['DEPARTMENT', 'SECTION'] }, name: deptName }, select: { id: true } })
      : null;

    let post = await prisma.orgUnit.findFirst({
      where: { companyId, type: 'POST', name: title, parentId: dept?.id ?? undefined }, select: { id: true },
    });
    const holderName = S(ps.holderName);
    if (!post) {
      post = await prisma.orgUnit.create({
        data: {
          companyId, parentId: dept?.id ?? null, type: 'POST', name: title,
          ckp: S(ps.ckp) || null, holderName: holderName || null, isVacant: !holderName,
        },
        select: { id: true },
      });
      created++;
      // #279: нова посада → пропозиція згенерувати посадову інструкцію
      if (await fireProposal(companyId, 'NEW_DOC', { postUnitId: post.id, title: `Посадова інструкція: ${title}`, reason: 'new_post_created' })) proposals++;
    } else if (holderName) {
      await prisma.orgUnit.update({ where: { id: post.id }, data: { holderName, isVacant: false } });
    }

    // Людина (Member) + призначення, якщо вказано реальне імʼя
    if (holderName) {
      const [firstName, ...rest] = holderName.split(/\s+/);
      let member = await prisma.member.findFirst({ where: { companyId, firstName, lastName: rest.join(' ') || null }, select: { id: true } });
      if (!member) member = await prisma.member.create({ data: { companyId, firstName, lastName: rest.join(' ') || null }, select: { id: true } });
      const link = await prisma.memberPost.findFirst({ where: { memberId: member.id, postUnitId: post.id } });
      if (!link) { await prisma.memberPost.create({ data: { memberId: member.id, postUnitId: post.id } }); membersLinked++; }
    }
  }

  return {
    companyId,
    reply: [
      `✅ Стадія 3: посад додано — ${created}, призначень людей — ${membersLinked}.`,
      proposals ? `📝 ${proposals} пропозицій інструкцій чекають підтвердження.` : '',
      'Далі — Стадія 4: ключові бізнес-процеси (потоки цінності).',
    ].filter(Boolean).join('\n'),
  };
}

/** Стадія 4 — бізнес-процеси (кроки: відповідальна посада → дія → результат). */
async function interviewProcesses(p: Params, ctx: AgentContext): Promise<AgentResult> {
  const companyId = ctx.companyId || S(p.companyId);
  if (!companyId) return { reply: 'Спершу Стадія 0.' };

  let created = 0;
  let proposals = 0;
  for (const it of arr(p.processes)) {
    const pr = it as Params;
    const name = S(pr.name);
    if (!name) continue;
    const exists = await prisma.process.findFirst({ where: { companyId, name }, select: { id: true } });
    if (exists) continue;
    const steps = arr(pr.steps);
    await prisma.process.create({
      data: {
        companyId, name, description: S(pr.description) || null,
        steps: (steps as unknown as object) ?? undefined,
      },
    });
    created++;

    // #279: кожен крок процесу зі згаданою посадою → пропозиція відобразити крок
    // у посадовій інструкції відповідальної посади.
    const seen = new Set<string>();
    for (const step of steps) {
      const postTitle = S((step as Params).post);
      if (!postTitle || seen.has(postTitle)) continue;
      seen.add(postTitle);
      const post = await prisma.orgUnit.findFirst({ where: { companyId, type: 'POST', name: postTitle }, select: { id: true } });
      if (!post) continue;
      const instr = await prisma.instruction.findFirst({ where: { companyId, postUnitId: post.id }, select: { id: true } });
      const ok = await fireProposal(
        companyId, 'INSTRUCTION_EDIT',
        { postUnitId: post.id, processName: name, reason: 'process_step_added', step },
        instr?.id ?? null,
      );
      if (ok) proposals++;
    }
  }

  return {
    companyId,
    reply: [
      `✅ Стадія 4: процесів додано — ${created}.`,
      proposals ? `📝 ${proposals} пропозицій оновити інструкції посад чекають підтвердження.` : '',
      'Далі — Стадія 5: чернетки посадових інструкцій для посад.',
    ].filter(Boolean).join('\n'),
  };
}

/** Стадія 5 — чернетки інструкцій (DB-запис DRAFT) для посад без інструкції. */
async function interviewInstructions(p: Params, ctx: AgentContext): Promise<AgentResult> {
  const companyId = ctx.companyId || S(p.companyId);
  if (!companyId) return { reply: 'Спершу Стадія 0.' };

  const posts = await prisma.orgUnit.findMany({
    where: { companyId, type: 'POST' }, select: { id: true, name: true, ckp: true },
  });
  let created = 0;
  for (const post of posts) {
    const has = await prisma.instruction.findFirst({ where: { companyId, postUnitId: post.id }, select: { id: true } });
    if (has) continue;
    await prisma.instruction.create({
      data: { companyId, postUnitId: post.id, title: `Посадова інструкція: ${post.name}`, status: 'DRAFT' },
    });
    created++;
  }

  return {
    companyId,
    reply: [
      `✅ Стадія 5: чернеток інструкцій створено — ${created} (для ${posts.length} посад).`,
      'Каркас орг.структури, процесів і чернеток інструкцій готовий. Далі можна наповнювати тексти інструкцій і уточнювати процеси.',
    ].join('\n'),
  };
}

const HANDLERS: Record<string, (p: Params, ctx: AgentContext) => Promise<AgentResult>> = {
  interview_start: interviewStart,
  interview_divisions: interviewDivisions,
  interview_departments: interviewDepartments,
  interview_posts: interviewPosts,
  interview_processes: interviewProcesses,
  interview_instructions: interviewInstructions,
};

export function isInterviewAction(action: string): boolean {
  return action in HANDLERS;
}

export function handleInterviewStage(action: string, params: Params, ctx: AgentContext): Promise<AgentResult> {
  return HANDLERS[action](params, ctx);
}
