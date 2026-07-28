// Клієнт вектор-мікросервісу для ОРГ (#224/#263). Індексація інструкцій та пошук
// семантично повʼязаних (щоб зміна однієї → пропозиції правок повʼязаних).
// Один вектор-проєкт на весь ОРГ; ізоляція компаній — через metadata.companyId + filters.
// Усе стійке до відмови: якщо сервіс недоступний — не блокуємо операції ОРГ.

const VECTOR_URL = process.env.VECTOR_URL || 'http://localhost:4500';
const VECTOR_TOKEN = process.env.VECTOR_TOKEN || '';

export function vectorEnabled(): boolean {
  return Boolean(VECTOR_TOKEN);
}

/** #306 Створити власний проєкт компанії у vector-базі (POST /projects — без токена). */
export async function createVectorProject(name: string, driveFolderId?: string): Promise<{ projectId: string; rootToken: string } | null> {
  try {
    const res = await fetch(`${VECTOR_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, driveFolderId: driveFolderId || '' }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return j?.rootToken ? { projectId: j.project?.id, rootToken: j.rootToken } : null;
  } catch { return null; }
}

/** #306 Створити під-токен, обмежений на конкретні папки (folderScope). */
export async function createSubToken(projectId: string, folderScope: string[], label: string): Promise<{ token: string } | null> {
  try {
    const res = await fetch(`${VECTOR_URL}/projects/${projectId}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderScope, label }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return j?.token ? { token: j.token } : null;
  } catch { return null; }
}

/** #306 Семантичний пошук у проєкті компанії (за її токеном). */
export async function vectorSearch(token: string, query: string, limit = 6): Promise<{ results: any[] } | null> {
  return call('/search', { query, limit }, token);
}

/** #307 Список токенів проєкту компанії. */
export async function listVectorTokens(projectId: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${VECTOR_URL}/projects/${projectId}/tokens`);
    if (!res.ok) return null;
    const j: any = await res.json();
    return Array.isArray(j?.tokens) ? j.tokens : [];
  } catch { return null; }
}

/** #307 Видалити під-токен проєкту компанії. */
export async function deleteVectorToken(projectId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${VECTOR_URL}/projects/${projectId}/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

async function call(path: string, body: unknown, token: string = VECTOR_TOKEN): Promise<any | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${VECTOR_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[vector]', path, res.status, (await res.text()).slice(0, 120));
      return null;
    }
    return res.json();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[vector] недоступний:', (e as Error).message);
    return null;
  }
}

/** Проіндексувати інструкцію (текст = заголовок + ЦКП посади + назви процесів). */
export async function indexInstruction(instr: {
  id: string; companyId: string; title: string; postUnitId?: string | null;
  text: string;
}): Promise<boolean> {
  const r = await call('/ingest', {
    collection: 'static',
    chunks: [{
      source: instr.title,
      content: instr.text,
      metadata: { companyId: instr.companyId, instructionId: instr.id, postUnitId: instr.postUnitId || '' },
    }],
  });
  return Boolean(r && r.ingested);
}

/** Проіндексувати файли з Диску компанії (колекція dynamic). Батчами, стійко до відмови.
 *  Повертає к-ть успішно проіндексованих чанків. */
export async function indexDriveDocuments(
  companyId: string,
  docs: { source: string; content: string; driveFileId: string; path: string; folderId?: string }[],
  token: string = VECTOR_TOKEN,
): Promise<number> {
  if (!docs.length) return 0;
  const chunks = docs.map((d) => ({
    source: d.source,
    content: d.content,
    folderId: d.folderId || '', // #306 пряма батьківська тека — для токенів-на-папку
    metadata: { companyId, driveFileId: d.driveFileId, path: d.path, kind: 'drive-file' },
  }));
  let ingested = 0;
  const BATCH = 20;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const r = await call('/ingest', { collection: 'dynamic', chunks: chunks.slice(i, i + BATCH) }, token);
    if (r && typeof r.ingested === 'number') ingested += r.ingested;
  }
  return ingested;
}

/** #303 (3b) Проіндексувати текстовий опис ієрархії папок компанії (колекція static).
 *  Дає семантичний доступ до самої структури (які відділи/посади вже є за теками). */
export async function indexDriveStructure(companyId: string, content: string, token: string = VECTOR_TOKEN): Promise<number> {
  if (!content.trim()) return 0;
  const r = await call('/ingest', {
    collection: 'static',
    chunks: [{ source: 'Структура папок компанії', content, folderId: '', metadata: { companyId, kind: 'folder-structure' } }],
  }, token);
  return r && typeof r.ingested === 'number' ? r.ingested : 0;
}

/** Знайти семантично повʼязані інструкції (у межах компанії), крім самої. */
export async function findRelatedInstructions(
  companyId: string, text: string, excludeInstructionId: string, opts?: { limit?: number; minScore?: number },
): Promise<{ instructionId: string; score: number; source: string }[]> {
  const limit = opts?.limit ?? 6;
  const minScore = opts?.minScore ?? 0.35;
  const r = await call('/search', { query: text, filters: { companyId }, limit: limit * 3 });
  if (!r || !Array.isArray(r.results)) return [];
  // дедуп за instructionId (беремо найкращий бал), виключаємо саму інструкцію
  const best = new Map<string, { score: number; source: string }>();
  for (const res of r.results) {
    const iid = String(res.metadata?.instructionId || '');
    if (!iid || iid === excludeInstructionId) continue;
    if (res.score < minScore) continue;
    const cur = best.get(iid);
    if (!cur || res.score > cur.score) best.set(iid, { score: res.score, source: res.source });
  }
  return Array.from(best.entries())
    .map(([instructionId, v]) => ({ instructionId, score: v.score, source: v.source }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
