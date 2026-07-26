// #303 Асинхронний індексатор робочої папки у вектор.
// Читає невиключені (Company.driveExcludedIds) файли пачками, пише у вектор,
// тримає прогрес у пам'яті процесу (org-api — один pm2-процес). Стійко до відмов:
// падіння окремого файлу не зупиняє індексацію.
import { listFolderTree, readFileText, type DriveNode, type DriveFileInfo } from '@platform/drive';
import { indexDriveDocuments, vectorEnabled } from './vector';
import { prisma } from '@platform/db';

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

/** Зібрати файли з дерева, пропускаючи виключені теки (разом із вмістом) та виключені файли. */
function collectFiles(nodes: DriveNode[], excluded: Set<string>): DriveFileInfo[] {
  const out: DriveFileInfo[] = [];
  const walk = (ns: DriveNode[]) => {
    for (const n of ns) {
      if (excluded.has(n.id)) continue; // виключено (тека → весь вміст, або окремий файл)
      if (n.isFolder) { if (n.children) walk(n.children); }
      else out.push({ id: n.id, name: n.name, mimeType: n.mimeType });
    }
  };
  walk(nodes);
  return out;
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
      const tree = await listFolderTree(folderId);
      const excl = new Set(excludedIds);
      const files = collectFiles(tree, excl);
      p.total = files.length;
      p.phase = 'reading';

      const BATCH = 12;
      let batch: { source: string; content: string; driveFileId: string; path: string }[] = [];
      for (const f of files) {
        p.processed++;
        let text: string | null = null;
        try { text = await readFileText(f); } catch { /* пропускаємо файл, що не читається */ }
        if (text && text.trim()) batch.push({ source: f.name, content: text, driveFileId: f.id, path: f.name });
        if (batch.length >= BATCH) { p.indexed += await indexDriveDocuments(companyId, batch); batch = []; }
      }
      if (batch.length) p.indexed += await indexDriveDocuments(companyId, batch);

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
