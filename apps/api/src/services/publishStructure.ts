import { prisma } from '@platform/db';
import {
  buildSkeletonInFolder,
  ensureInstructionOriginal,
  ensureEmployeeFolder,
  ensurePostInEmployeeFolder,
  ensureFolder,
  listFolderFiles,
  moveFile,
  driveFolderUrl,
} from '@platform/drive';
import { CANONICAL_DIVISIONS, instructionSkeleton } from '@platform/org-template';
import { withCompanyDrive } from './driveScope';

/**
 * Перенесення орг-структури з бази на Google Drive клієнта.
 *
 * Досі ця ланка була відсутня: інтервʼю наповнювало базу, функції створення тек
 * існували, але їх ніхто не викликав — на Диску не зʼявлялось нічого. Тут вони
 * зʼєднуються.
 *
 * Що робимо:
 *  1. Оригінал інструкції для кожної ПОСАДИ — у Відділенні побудови, у дзеркалі
 *     орг-структури. Один оригінал на посаду, ніколи не копія.
 *  2. Тека працівника — на ЛЮДИНУ, не на посаду: одна людина може обіймати кілька
 *     посад, і папка на посаду вимагала б її дублювати.
 *  3. Усередині теки працівника — по теці на кожну його посаду з ЯРЛИКОМ на оригінал.
 *
 * Ідемпотентно: повторний виклик нічого не дублює.
 */

export interface PublishResult {
  companyFolderUrl: string;
  instructionsCreated: number;
  employeesCreated: number;
  postFoldersCreated: number;
  skipped: { post: string; reason: string }[];
  archived: string[];
}

/** Відділення, до якого належить одиниця: піднімаємось деревом до типу DIVISION. */
function findDivisionBoardNo(
  unitId: string,
  byId: Map<string, { parentId: string | null; type: string; boardNo: number | null }>,
): number {
  let cur: string | null = unitId;
  for (let hop = 0; hop < 10 && cur; hop++) {
    const u = byId.get(cur);
    if (!u) break;
    if (u.type === 'DIVISION' && u.boardNo) return u.boardNo;
    cur = u.parentId;
  }
  return 7; // Адміністративне — усе, що не вдалось віднести
}

export async function publishStructureToDrive(companyId: string): Promise<PublishResult> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      driveWriteFolderId: true,
      driveRegulationsFolderId: true,
      driveEmployeesFolderId: true,
    },
  });
  if (!company) throw new Error('Компанію не знайдено');
  if (!company.driveWriteFolderId || company.driveWriteFolderId === 'root') {
    throw new Error('no-write-folder');
  }

  const units = await prisma.orgUnit.findMany({
    where: { companyId },
    select: {
      id: true, parentId: true, type: true, name: true, ckp: true, boardNo: true,
      holderName: true, unitStatus: true,
    },
  });
  const byId = new Map(units.map((u) => [u.id, u]));
  // Посаду, яку виводять, не публікуємо: її документ уже поїхав в «Архів», і
  // створювати його заново означало б воскрешати посаду щоразу при публікації.
  const posts = units.filter((u) => u.type === 'POST' && u.unitStatus !== 'DEPRECATED');

  const members = await prisma.member.findMany({
    where: { companyId },
    select: {
      firstName: true,
      lastName: true,
      posts: { select: { postUnit: { select: { id: true, name: true } } } },
    },
  });

  const skipped: PublishResult['skipped'] = [];
  const archived: string[] = [];
  let instructionsCreated = 0;
  let employeesCreated = 0;
  let postFoldersCreated = 0;

  await withCompanyDrive(companyId, async () => {
    const root = company.driveWriteFolderId!;

    // Скелет обходить два десятки тек — це довше за таймаут інструмента агента.
    // Тому вузли запамʼятовуємо після першої побудови й далі беремо готові.
    let regulationsRootId = company.driveRegulationsFolderId;
    let employeesRootId = company.driveEmployeesFolderId;
    if (!regulationsRootId || !employeesRootId) {
      const skeleton = await buildSkeletonInFolder(root);
      regulationsRootId = skeleton.regulationsRootId;
      employeesRootId = skeleton.employeesRootId;
      await prisma.company.update({
        where: { id: companyId },
        data: { driveRegulationsFolderId: regulationsRootId, driveEmployeesFolderId: employeesRootId },
      });
    }

    // ── 1. Оригінали інструкцій ────────────────────────────────────────────
    const docByPostId = new Map<string, string>();
    for (const post of posts) {
      const boardNo = findDivisionBoardNo(post.parentId ?? post.id, byId);
      const parent = post.parentId ? byId.get(post.parentId) : null;
      const deptName = parent?.type === 'DEPARTMENT' ? parent.name : null;

      const docId = await ensureInstructionOriginal(
        regulationsRootId,
        boardNo,
        deptName,
        post.name,
        post.ckp || '',
      );
      docByPostId.set(post.id, docId);
      instructionsCreated++;
    }

    // ── 2-3. Теки працівників і посад усередині них ────────────────────────
    // Джерела два. Member — коли людину завели як працівника (через прив'язку
    // Telegram чи вручну). holderName на посаді — коли її назвав асистент у розмові:
    // саме так наповнюється структура під час знайомства, і без цього теки
    // працівників не створювались узагалі.
    const byPerson = new Map<string, { id: string; name: string }[]>();

    for (const m of members) {
      const personName = [m.lastName, m.firstName].filter(Boolean).join(' ').trim();
      if (!personName || !m.posts.length) continue;
      byPerson.set(personName, m.posts.map((p) => ({ id: p.postUnit.id, name: p.postUnit.name })));
    }

    for (const post of posts) {
      const holder = (post.holderName || '').trim();
      if (!holder) continue;
      const list = byPerson.get(holder) ?? [];
      if (!list.some((x) => x.id === post.id)) list.push({ id: post.id, name: post.name });
      byPerson.set(holder, list);
    }

    // ── 4. Прибирання застарілого ──────────────────────────────────────────
    // Посаду перейменували чи прибрали — її документ лишається лежати й вводити
    // в оману. Не видаляємо (на диску клієнта це надто дорога помилка), а
    // переносимо в «Архів»: зворотно й видно, що сталось.
    const liveDocIds = new Set(docByPostId.values());
    const archiveFolder = await ensureFolder(regulationsRootId, 'Архів');
    // Обхід теки рекурсивний, тож він заходить і в сам «Архів». Без цього кроку
    // публікація щоразу «архівувала» вже заархівоване і рапортувала про це.
    const alreadyArchived = new Set((await listFolderFiles(archiveFolder)).map((f) => f.id));
    for (const f of await listFolderFiles(regulationsRootId)) {
      if (!/ — Інструкція$/.test(f.name)) continue;
      if (liveDocIds.has(f.id) || alreadyArchived.has(f.id)) continue;
      await moveFile(f.id, archiveFolder);
      archived.push(f.name);
    }

    for (const [personName, personPosts] of byPerson) {
      const folder = await ensureEmployeeFolder(employeesRootId, personName);
      employeesCreated++;

      for (const p of personPosts) {
        const docId = docByPostId.get(p.id);
        if (!docId) {
          skipped.push({ post: `${personName} / ${p.name}`, reason: 'немає оригіналу інструкції' });
          continue;
        }
        await ensurePostInEmployeeFolder(folder, p.name, docId);
        postFoldersCreated++;
      }
    }
  });

  return {
    companyFolderUrl: driveFolderUrl(company.driveWriteFolderId),
    instructionsCreated,
    employeesCreated,
    postFoldersCreated,
    skipped,
    archived,
  };
}

/** Текст-каркас інструкції — щоб ORG і асистент користувались однією структурою. */
export { instructionSkeleton };
