// Клієнт вектор-мікросервісу для ОРГ (#224/#263). Індексація інструкцій та пошук
// семантично повʼязаних (щоб зміна однієї → пропозиції правок повʼязаних).
// Один вектор-проєкт на весь ОРГ; ізоляція компаній — через metadata.companyId + filters.
// Усе стійке до відмови: якщо сервіс недоступний — не блокуємо операції ОРГ.

const VECTOR_URL = process.env.VECTOR_URL || 'http://localhost:4500';
const VECTOR_TOKEN = process.env.VECTOR_TOKEN || '';

export function vectorEnabled(): boolean {
  return Boolean(VECTOR_TOKEN);
}

async function call(path: string, body: unknown): Promise<any | null> {
  if (!VECTOR_TOKEN) return null;
  try {
    const res = await fetch(`${VECTOR_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VECTOR_TOKEN}` },
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
  docs: { source: string; content: string; driveFileId: string; path: string }[],
): Promise<number> {
  if (!docs.length) return 0;
  const chunks = docs.map((d) => ({
    source: d.source,
    content: d.content,
    metadata: { companyId, driveFileId: d.driveFileId, path: d.path, kind: 'drive-file' },
  }));
  let ingested = 0;
  const BATCH = 20;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const r = await call('/ingest', { collection: 'dynamic', chunks: chunks.slice(i, i + BATCH) });
    if (r && typeof r.ingested === 'number') ingested += r.ingested;
  }
  return ingested;
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
