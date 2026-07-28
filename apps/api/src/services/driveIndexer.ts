// #303 Асинхронний індексатор робочої папки у вектор.
// Читає невиключені (Company.driveExcludedIds) файли пачками, пише у вектор,
// тримає прогрес у пам'яті процесу (org-api — один pm2-процес). Стійко до відмов:
// падіння окремого файлу не зупиняє індексацію.
import { listFolderTree, readFileText, type DriveNode, type DriveFileInfo } from '@platform/drive';
import { indexDriveDocuments, indexDriveStructure, createVectorProject, vectorEnabled } from './vector';
import { prisma } from '@platform/db';

/** #306 Гарантувати власний vector-проєкт компанії; повертає її root-токен (або null). */
async function ensureCompanyVector(companyId: string, driveFolderId: string): Promise<string | null> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, vectorToken: true } });
  if (c?.vectorToken) return c.vectorToken;
  const proj = await createVectorProject(c?.name || `Company ${companyId}`, driveFolderId);
  if (!proj?.rootToken) return null;
  await prisma.company.update({ where: { id: companyId }, data: { vectorProjectId: proj.projectId, vectorToken: proj.rootToken } }).catch(() => {});
  return proj.rootToken;
}

export interface IndexProgress {
  running: boolean;
  phase: 'idle' | 'listing' | 'reading' | 'done' | 'error';
  total: number;
  processed: number;
  indexed: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

const IDLE: IndexProgress = { running: false, phase: 'idle', total: 0, processed: 0, indexed: 0, startedAt: null, finishedAt: null, error: null };
const progressMap = new Map<string, IndexProgress>();

export function getIndexProgress(companyId: string): IndexProgress {
  return progressMap.get(companyId) ?? { ...IDLE };
}

/** Зібрати файли з дерева (з їх прямою текою-батьком), пропускаючи виключені. */
function collectFiles(nodes: DriveNode[], excluded: Set<string>, rootId: string): (DriveFileInfo & { folderId: string })[] {
  const out: (DriveFileInfo & { folderId: string })[] = [];
  const walk = (ns: DriveNode[], parent: string) => {
    for (const n of ns) {
      if (excluded.has(n.id)) continue; // виключено (тека → весь вміст, або окремий файл)
      if (n.isFolder) { if (n.children) walk(n.children, n.id); }
      else out.push({ id: n.id, name: n.name, mimeType: n.mimeType, folderId: parent });
    }
  };
  walk(nodes, rootId);
  return out;
}

/** #303 (3b) Текстовий опис ієрархії тек (лише невиключені) — відступами. */
function buildStructureText(nodes: DriveNode[], excluded: Set<string>): string {
  const lines: string[] = ['Ієрархія папок компанії (для розуміння орг-структури):'];
  const walk = (ns: DriveNode[], depth: number) => {
    for (const n of ns) {
      if (excluded.has(n.id)) continue;
      if (!n.isFolder) continue; // лише теки — це структура
      lines.push('  '.repeat(depth) + '- ' + n.name);
      if (n.children) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return lines.join('\n');
}

/** Запустити фонову індексацію. Повертає одразу; прогрес — через getIndexProgress. */
export function startDriveIndex(companyId: string, folderId: string, excludedIds: string[]): { started: boolean; reason?: string } {
  const cur = progressMap.get(companyId);
  if (cur?.running) return { started: false, reason: 'already-running' };
  if (!vectorEnabled()) return { started: false, reason: 'vector-disabled' };

  const p: IndexProgress = { running: true, phase: 'listing', total: 0, processed: 0, indexed: 0, startedAt: Date.now(), finishedAt: null, error: null };
  progressMap.set(companyId, p);

  // fire-and-forget: не блокуємо HTTP-відповідь
  void (async () => {
    try {
      // #306 Власний vector-проєкт компанії (свій root-токен) — індексуємо саме в нього
      const token = await ensureCompanyVector(companyId, folderId);
      if (!token) throw new Error('не вдалося створити vector-проєкт компанії (vector недоступний?)');

      const tree = await listFolderTree(folderId);
      const excl = new Set(excludedIds);
      const files = collectFiles(tree, excl, folderId);
      p.total = files.length;
      p.phase = 'reading';

      const BATCH = 12;
      let batch: { source: string; content: string; driveFileId: string; path: string; folderId: string }[] = [];
      for (const f of files) {
        p.processed++;
        let text: string | null = null;
        try { text = await readFileText(f); } catch { /* пропускаємо файл, що не читається */ }
        if (text && text.trim()) batch.push({ source: f.name, content: text, driveFileId: f.id, path: f.name, folderId: f.folderId });
        if (batch.length >= BATCH) { p.indexed += await indexDriveDocuments(companyId, batch, token); batch = []; }
      }
      if (batch.length) p.indexed += await indexDriveDocuments(companyId, batch, token);

      // #303 (3b) Проіндексувати саму структуру папок (крім виключених)
      try { await indexDriveStructure(companyId, buildStructureText(tree, excl), token); } catch { /* не критично */ }

      p.phase = 'done';
      p.running = false;
      p.finishedAt = Date.now();
      await prisma.company.update({
        where: { id: companyId },
        data: { driveIndexedAt: new Date(), driveIndexedCount: p.indexed },
      }).catch(() => {});
    } catch (e) {
      p.phase = 'error';
      p.running = false;
      p.error = (e as Error)?.message ?? String(e);
      p.finishedAt = Date.now();
    }
  })();

  return { started: true };
}
