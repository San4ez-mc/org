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

/** #309 Generic-генерація через флоус (Vertex Gemini) — для структурного витягу фактів (3c/3e). */
const FLOWS_GEN_URL = (process.env.FLOWS_RAG_URL || 'http://127.0.0.1:3000/api/rag/search').replace(/\/search$/, '/generate');
const RAG_SECRET_V = process.env.RAG_SECRET || '';
export async function flowsGenerate(prompt: string, maxTokens = 2048): Promise<string | null> {
  try {
    const res = await fetch(FLOWS_GEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rag-Secret': RAG_SECRET_V },
      body: JSON.stringify({ prompt, maxTokens }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return typeof j?.text === 'string' ? j.text : null;
  } catch { return null; }
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

// ── Розбиття на чанки ─────────────────────────────────────────────────────────
// ЧОМУ це критично: ембединг-модель має жорсткий ліміт входу (~2048 токенів у
// Vertex text-embedding-004) і мовчки обрізає все, що довше. Файл на 69k символів
// давав ОДИН вектор, у який реально потрапляв лише початок тексту; такий вектор
// «однаково схожий» на будь-який запит — саме тому пошук на «бізнес процес» і на
// «кандидат вакансія» повертав ті самі резюме з майже однаковим балом.
// Один змістовний фрагмент = один вектор; тоді косинус справді щось означає.

/** Цільовий розмір чанка. ~1000 символів ≈ 250–350 токенів української —
 *  вдесятеро менше ліміту моделі (нічого не обрізається) і водночас достатньо,
 *  щоб фрагмент лишався самодостатнім для LLM, яка потім читає видачу. */
const CHUNK_SIZE = 1000;
/** Перекриття між сусідніми чанками: думка, розрізана по межі, лишається цілою
 *  хоча б в одному з них (напр. «Місія посади:» в кінці одного, сам текст — на початку наступного). */
const CHUNK_OVERLAP = 150;
/** Запобіжник від патологічних файлів (вивантаження таблиць на мегабайти):
 *  один файл не має права роздути індекс і сповільнити пошук усім іншим. */
const MAX_CHUNKS_PER_DOC = 400;

/** Хвіст рядка довжиною ~n, обрізаний по межі слова (для перекриття). */
function tailWords(s: string, n: number): string {
  if (n <= 0) return '';
  if (s.length <= n) return s;
  const t = s.slice(-n);
  const i = t.search(/\s/);
  return (i >= 0 ? t.slice(i + 1) : t).trim();
}

/** Порізати надто довгий блок без абзаців (напр. рядок таблиці) — спершу по
 *  реченнях, і лише в крайньому разі по пробілах. Слова не розриваємо. */
function splitLongBlock(block: string, size: number): string[] {
  const out: string[] = [];
  let buf = '';
  for (const part of block.split(/(?<=[.!?;:])\s+/)) {
    if (part.length > size) {
      if (buf) { out.push(buf); buf = ''; }
      let rest = part;
      while (rest.length > size) {
        let cut = rest.lastIndexOf(' ', size);
        if (cut < size * 0.5) cut = size; // суцільний масив без пробілів — інакше не поріжеш
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      buf = rest;
      continue;
    }
    if (buf && buf.length + 1 + part.length > size) { out.push(buf); buf = part; }
    else buf = buf ? `${buf} ${part}` : part;
  }
  if (buf) out.push(buf);
  return out.filter(Boolean);
}

/** Розбити текст документа на чанки по межах абзаців/рядків із перекриттям. */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = String(text || '')
    // NUL та інші керівні байти трапляються у витягах з .docx/.pdf; Postgres на
    // боці вектора відбиває такий рядок, і разом з ним гине ВЕСЬ батч.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= size + overlap) return [clean];

  // Абзац → (якщо завеликий) рядок → (якщо все ще завеликий) речення/слова.
  const units = clean
    .split(/\n{2,}/)
    .flatMap((b) => (b.length > size ? b.split('\n') : [b]))
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((b) => (b.length > size ? splitLongBlock(b, size) : [b]));

  const chunks: string[] = [];
  let buf = '';
  for (const u of units) {
    if (buf && buf.length + 1 + u.length > size) {
      chunks.push(buf);
      const carry = tailWords(buf, overlap);
      buf = carry ? `${carry}\n${u}` : u;
    } else {
      buf = buf ? `${buf}\n${u}` : u;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  // Куций хвіст сам по собі майже не несе змісту — приклеюємо до попереднього.
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 200) {
    chunks[chunks.length - 2] += `\n${chunks.pop()}`;
  }
  return chunks;
}

/** Очистити чанки колекції проєкту у вектор-базі (ідемпотентна переіндексація).
 *  Без source — чиститься вся колекція проєкту. Повертає к-ть видалених рядків. */
export async function deleteVectorChunks(
  token: string,
  collection: 'static' | 'dynamic',
  source?: string,
): Promise<number> {
  const r = await call('/delete', source ? { collection, source } : { collection }, token);
  return r && typeof r.deleted === 'number' ? r.deleted : 0;
}

/** Проіндексувати файли з Диску компанії (колекція dynamic). Батчами, стійко до відмови.
 *  Кожен файл ріжеться на чанки; chunkNo зростає в межах файлу.
 *  Повертає к-ть успішно проіндексованих чанків. */
export async function indexDriveDocuments(
  companyId: string,
  docs: { source: string; content: string; driveFileId: string; path: string; folderId?: string }[],
  token: string = VECTOR_TOKEN,
): Promise<number> {
  if (!docs.length) return 0;
  const chunks: {
    source: string; chunkNo: number; content: string; folderId: string; metadata: Record<string, unknown>;
  }[] = [];
  for (const d of docs) {
    const parts = chunkText(d.content).slice(0, MAX_CHUNKS_PER_DOC);
    parts.forEach((content, i) => chunks.push({
      source: d.source,
      chunkNo: i,
      content,
      folderId: d.folderId || '', // #306 пряма батьківська тека — для токенів-на-папку
      metadata: { companyId, driveFileId: d.driveFileId, path: d.path, kind: 'drive-file' },
    }));
  }
  let ingested = 0;
  for (const slice of batchByBudget(chunks)) {
    const r = await call('/ingest', { collection: 'dynamic', chunks: slice }, token);
    if (r && typeof r.ingested === 'number') { ingested += r.ingested; continue; }
    // Батч упав цілком — а падає він через ОДИН зіпсутий чанк (нечитабельний
    // байт, аномальна довжина). Дотягуємо решту поштучно, щоб не втратити
    // десятки нормальних фрагментів через один поганий.
    if (slice.length === 1) continue;
    for (const c of slice) {
      const one = await call('/ingest', { collection: 'dynamic', chunks: [c] }, token);
      if (one && typeof one.ingested === 'number') ingested += one.ingested;
    }
  }
  return ingested;
}

/** Порізати чанки на запити до /ingest за бюджетом символів, а не за кількістю.
 *  ЧОМУ: Vertex рахує ліміт (20k токенів) на ВЕСЬ запит, а не на елемент —
 *  фіксована кількість чанків на щільному тексті вилітала за ліміт і вбивала
 *  весь батч. Кирилиця ≈ 0.8 токена на символ, тож 14k символів ≈ 11k токенів. */
function batchByBudget<T extends { content: string }>(chunks: T[]): T[][] {
  const MAX_CHARS = 14_000;
  const MAX_ITEMS = 20; // рівно стільки Vertex обробляє за один внутрішній виклик
  const out: T[][] = [];
  let cur: T[] = [];
  let chars = 0;
  for (const c of chunks) {
    if (cur.length && (cur.length >= MAX_ITEMS || chars + c.content.length > MAX_CHARS)) {
      out.push(cur); cur = []; chars = 0;
    }
    cur.push(c);
    chars += c.content.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** #303 (3b) Проіндексувати текстовий опис ієрархії папок компанії (колекція static).
 *  Дає семантичний доступ до самої структури (які відділи/посади вже є за теками). */
export async function indexDriveStructure(companyId: string, content: string, token: string = VECTOR_TOKEN): Promise<number> {
  if (!content.trim()) return 0;
  // Дерево тек великої компанії теж переростає ліміт моделі — ріжемо так само.
  const parts = chunkText(content);
  const r = await call('/ingest', {
    collection: 'static',
    chunks: parts.map((c, i) => ({
      source: 'Структура папок компанії', chunkNo: i, content: c, folderId: '',
      metadata: { companyId, kind: 'folder-structure' },
    })),
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
