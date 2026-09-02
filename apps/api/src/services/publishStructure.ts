import { prisma } from '@platform/db';
import {
  buildSkeletonInFolder,
  ensureInstructionOriginal,
  ensureEmployeeFolder,
  ensurePostInEmployeeFolder,
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
    select: { name: true, driveWriteFolderId: true },
  });
  if (!company) throw new Error('Компанію не знайдено');
  if (!company.driveWriteFolderId || company.driveWriteFolderId === 'root') {
    throw new Error('no-write-folder');
  }

  const units = await prisma.orgUnit.findMany({
    where: { companyId },
    select: { id: true, parentId: true, type: true, name: true, ckp: true, boardNo: true, holderName: true },
  });
  const byId = new Map(units.map((u) => [u.id, u]));
  const posts = units.filter((u) => u.type === 'POST');

  const members = await prisma.member.findMany({
    where: { companyId },
    select: {
      firstName: true,
      lastName: true,
      posts: { select: { postUnit: { select: { id: true, name: true } } } },
    },
  });

  const skipped: PublishResult['skipped'] = [];
  let instructionsCreated = 0;
  let employeesCreated = 0;
  let postFoldersCreated = 0;

  await withCompanyDrive(companyId, async () => {
    const root = company.driveWriteFolderId!;
    const skeleton = await buildSkeletonInFolder(root);

    // ── 1. Оригінали інструкцій ────────────────────────────────────────────
    const docByPostId = new Map<string, string>();
    for (const post of posts) {
      const boardNo = findDivisionBoardNo(post.parentId ?? post.id, byId);
      const parent = post.parentId ? byId.get(post.parentId) : null;
      const deptName = parent?.type === 'DEPARTMENT' ? parent.name : null;

      const docId = await ensureInstructionOriginal(
        skeleton.regulationsRootId,
        boardNo,
        deptName,
        post.name,
        post.ckp || '',
      );
      docByPostId.set(post.id, docId);
      instructionsCreated++;
    }

    // ── 2-3. Теки працівників і посад усередині них ────────────────────────
    for (const m of members) {
      // Прізвище першим — так теки сортуються за людьми, а не за іменами.
      const personName = [m.lastName, m.firstName].filter(Boolean).join(' ').trim();
      if (!personName) continue;
      if (!m.posts.length) {
        skipped.push({ post: personName, reason: 'людина без посади — теку не створюємо' });
        continue;
      }

      const folder = await ensureEmployeeFolder(skeleton.employeesRootId, personName);
      employeesCreated++;

      for (const p of m.posts) {
        const docId = docByPostId.get(p.postUnit.id);
        if (!docId) {
          skipped.push({ post: `${personName} / ${p.postUnit.name}`, reason: 'немає оригіналу інструкції' });
          continue;
        }
        await ensurePostInEmployeeFolder(folder, p.postUnit.name, docId);
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
  };
}

/** Текст-каркас інструкції — щоб ORG і асистент користувались однією структурою. */
export { instructionSkeleton };
