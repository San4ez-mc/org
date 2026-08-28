import { getDrive, getSheets, getDocs, SHARED_DRIVE_PARAMS } from './google';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const DOC_MIME = 'application/vnd.google-apps.document';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

function escapeName(name: string): string {
  return name.replace(/'/g, "\\'");
}

/** Проста повторна спроба на rate-limit (429 / rateLimitExceeded). */
async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const code = err?.code ?? err?.response?.status;
      const reason = err?.errors?.[0]?.reason ?? '';
      const retriable = code === 429 || code === 403 && /rateLimit|userRateLimit/i.test(reason) || code === 500 || code === 503;
      if (!retriable || i === tries - 1) throw err;
      const wait = Math.min(2 ** i * 500, 8000) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, wait));
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Знайти дочірній елемент за назвою (без trashed). */
async function findChild(parentId: string, name: string, mime?: string): Promise<string | null> {
  const drive = getDrive();
  const mimeClause = mime ? ` and mimeType = '${mime}'` : '';
  const res = await withRetry(() =>
    drive.files.list({
      q: `name = '${escapeName(name)}' and '${parentId}' in parents and trashed = false${mimeClause}`,
      fields: 'files(id, name, mimeType)',
      pageSize: 1,
      ...SHARED_DRIVE_PARAMS,
    }),
  );
  return res.data.files?.[0]?.id ?? null;
}

/** Забезпечити наявність теки (знайти або створити). Ідемпотентно. */
export async function ensureFolder(parentId: string, name: string): Promise<string> {
  const existing = await findChild(parentId, name, FOLDER_MIME);
  if (existing) return existing;
  const drive = getDrive();
  const res = await withRetry(() =>
    drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: 'id',
      ...SHARED_DRIVE_PARAMS,
    }),
  );
  return res.data.id!;
}

/** Створити (або знайти) Google Таблицю в теці. */
export async function ensureSpreadsheet(parentId: string, name: string): Promise<string> {
  const existing = await findChild(parentId, name, SHEET_MIME);
  if (existing) return existing;
  const drive = getDrive();
  const res = await withRetry(() =>
    drive.files.create({
      requestBody: { name, mimeType: SHEET_MIME, parents: [parentId] },
      fields: 'id',
      ...SHARED_DRIVE_PARAMS,
    }),
  );
  return res.data.id!;
}

/** Створити (або знайти) Google Документ; опційно з початковим текстом (лише при створенні). */
export async function ensureDoc(parentId: string, name: string, content?: string): Promise<string> {
  const existing = await findChild(parentId, name, DOC_MIME);
  if (existing) return existing;
  const drive = getDrive();
  const res = await withRetry(() =>
    drive.files.create({
      requestBody: { name, mimeType: DOC_MIME, parents: [parentId] },
      fields: 'id',
      ...SHARED_DRIVE_PARAMS,
    }),
  );
  const docId = res.data.id!;
  if (content) {
    const docs = getDocs();
    await withRetry(() =>
      docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ insertText: { location: { index: 1 }, text: content } }] },
      }),
    );
  }
  return docId;
}

/** Створити (або знайти) ярлик на файл/теку в теці. */
export async function ensureShortcut(parentId: string, name: string, targetId: string): Promise<string> {
  const existing = await findChild(parentId, name, SHORTCUT_MIME);
  if (existing) return existing;
  const drive = getDrive();
  const res = await withRetry(() =>
    drive.files.create({
      requestBody: {
        name,
        mimeType: SHORTCUT_MIME,
        parents: [parentId],
        shortcutDetails: { targetId },
      },
      fields: 'id',
      ...SHARED_DRIVE_PARAMS,
    }),
  );
  return res.data.id!;
}

/** Записати значення у таблицю (з лівого верхнього кута аркуша). */
export async function writeSheetValues(spreadsheetId: string, values: (string | number)[][], range = 'A1'): Promise<void> {
  const sheets = getSheets();
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values },
    }),
  );
}

/** Дозаписати рядки в кінець таблиці (для Журналу). */
export async function appendSheetValues(
  spreadsheetId: string,
  values: (string | number)[][],
  range = 'A1',
): Promise<void> {
  const sheets = getSheets();
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    }),
  );
}

export interface RowColor {
  startRow: number; // 0-based, включно
  endRow: number; // 0-based, виключно
  rgb: { red: number; green: number; blue: number };
}

/** Пофарбувати фон рядків на першому аркуші таблиці (для PAEI-кольорів Адізеса). */
export async function setRowBackground(
  spreadsheetId: string,
  rows: RowColor[],
  columnCount = 6,
): Promise<void> {
  if (!rows.length) return;
  const sheets = getSheets();
  const requests = rows.map((r) => ({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: r.startRow, endRowIndex: r.endRow, startColumnIndex: 0, endColumnIndex: columnCount },
      cell: { userEnteredFormat: { backgroundColor: r.rgb } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  }));
  await withRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }));
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
}

/** Перелік файлів (не тек) у теці — рекурсивно по підтеках. */
export async function listFolderFiles(folderId: string): Promise<DriveFileInfo[]> {
  const drive = getDrive();
  const out: DriveFileInfo[] = [];
  const walk = async (id: string) => {
    let pageToken: string | undefined;
    do {
      const res = await withRetry(() =>
        drive.files.list({
          q: `'${id}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType)',
          pageSize: 200,
          pageToken,
          ...SHARED_DRIVE_PARAMS,
        }),
      );
      for (const f of res.data.files ?? []) {
        if (f.mimeType === FOLDER_MIME) await walk(f.id!);
        else out.push({ id: f.id!, name: f.name!, mimeType: f.mimeType! });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  };
  await walk(folderId);
  return out;
}

export interface DriveNode {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  isFolder: boolean;
  children?: DriveNode[];
}

/** Знайти дочірню теку за назвою (для навігації шляхом). */
export async function findFolderByName(parentId: string, name: string): Promise<string | null> {
  return findChild(parentId, name, FOLDER_MIME);
}

/** Виконати async-функцію над елементами з обмеженою конкурентністю (пул воркерів). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Побудувати дерево вмісту теки (папки + файли з посиланням), рекурсивно.
 *  Підтеки читаються паралельно (обмежена конкурентність) — швидко на великих деревах. */
export async function listFolderTree(folderId: string, depth = 6): Promise<DriveNode[]> {
  if (depth < 0) return [];
  const drive = getDrive();
  const entries: DriveNode[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(() =>
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
        orderBy: 'folder,name',
        pageSize: 200,
        pageToken,
        ...SHARED_DRIVE_PARAMS,
      }),
    );
    for (const f of res.data.files ?? []) {
      entries.push({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        webViewLink: f.webViewLink ?? undefined,
        isFolder: f.mimeType === FOLDER_MIME,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Рекурсія у підтеки — паралельно, до 8 одночасно (withRetry гасить rate-limit).
  const folders = entries.filter((e) => e.isFolder);
  await mapWithConcurrency(folders, 8, async (node) => {
    node.children = await listFolderTree(node.id, depth - 1);
  });
  return entries;
}

const SHEET_TEXT_CAP = 60000; // #303 обмеження тексту таблиці, щоб не роздути вектор

/** Прочитати Google Sheet у текст: усі вкладки, рядки у форму "Заголовок: значення | …".
 *  Перший рядок кожної вкладки — заголовки-контекст. Порожні вкладки/рядки пропускаємо. */
async function readSheetText(fileId: string): Promise<string | null> {
  const sheets = getSheets();
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId: fileId }));
  const parts: string[] = [];
  for (const t of meta.data.sheets ?? []) {
    const title = t.properties?.title ?? 'Аркуш';
    const vr = await withRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${title.replace(/'/g, "''")}'` }),
    );
    const rows = (vr.data.values ?? []) as unknown[][];
    if (!rows.length) continue;
    const header = (rows[0] ?? []).map((c) => String(c ?? '').trim());
    const hasHeader = header.filter(Boolean).length >= 2;
    const lines: string[] = [`# Вкладка: ${title}`];
    for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (!row.some((c) => String(c ?? '').trim())) continue; // порожній рядок
      const cells = row
        .map((c, j) => {
          const v = String(c ?? '').trim();
          if (!v) return '';
          const h = hasHeader ? header[j] : '';
          return h ? `${h}: ${v}` : v;
        })
        .filter(Boolean);
      if (cells.length) lines.push(cells.join(' | '));
    }
    if (lines.length > 1) parts.push(lines.join('\n'));
  }
  const text = parts.join('\n\n').trim();
  if (!text) return null;
  return text.length > SHEET_TEXT_CAP ? text.slice(0, SHEET_TEXT_CAP) + '\n…(обрізано)' : text;
}

/** Прочитати текст файлу: Google Doc → export text/plain; Google Sheet → усі вкладки;
 *  text/* → media. Інакше null. */
export async function readFileText(file: DriveFileInfo): Promise<string | null> {
  const drive = getDrive();
  try {
    if (file.mimeType === DOC_MIME) {
      const res = await withRetry(() =>
        drive.files.export({ fileId: file.id, mimeType: 'text/plain' }, { responseType: 'text' }),
      );
      return String(res.data ?? '').trim() || null;
    }
    if (file.mimeType === SHEET_MIME) {
      return await readSheetText(file.id);
    }
    if (file.mimeType.startsWith('text/')) {
      const res = await withRetry(() =>
        drive.files.get({ fileId: file.id, alt: 'media', ...SHARED_DRIVE_PARAMS }, { responseType: 'text' }),
      );
      return String(res.data ?? '').trim() || null;
    }
    return null; // pdf/docx/інше — поки пропускаємо
  } catch {
    return null;
  }
}

export function driveFolderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** Швидка перевірка доступу: метадані теки за id. */
export async function getFileMeta(id: string) {
  const drive = getDrive();
  const res = await withRetry(() =>
    drive.files.get({ fileId: id, fields: 'id, name, mimeType, driveId', ...SHARED_DRIVE_PARAMS }),
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Інструменти асистента (Digital Hiring, ТЗ §0.1): пошук, читання, запис.
// Тонкий шар поверх наявних хелперів — окремого Google-клієнта тут не заводимо.
// ─────────────────────────────────────────────────────────────────────────────

/** Результат пошуку: як DriveFileInfo, але з посиланням і датою — це те, що бачить агент. */
export interface DriveSearchHit extends DriveFileInfo {
  webViewLink?: string;
  modifiedTime?: string;
}

/** Скільки сторінок видачі максимум переглядаємо, коли фільтруємо по теці. */
const SEARCH_MAX_PAGES = 5;

/**
 * Чи є файл нащадком теки (на будь-якій глибині).
 * Drive не вміє рекурсивний `in parents`, а перелічувати теки наперед не можна —
 * на реальному диску їх сотні, і будь-яка стеля мовчки ріже видачу.
 * Тому йдемо навпаки: від файлу вгору по parents. `cache` живе в межах одного пошуку.
 */
async function isDescendantOf(
  fileId: string,
  ancestorId: string,
  cache: Map<string, string | null>,
): Promise<boolean> {
  const drive = getDrive();
  let current: string | null = fileId;

  for (let hop = 0; hop < 12 && current; hop++) {
    if (current === ancestorId) return true;

    let parent = cache.get(current);
    if (parent === undefined) {
      try {
        const res = await withRetry(() =>
          drive.files.get({ fileId: current!, fields: 'parents', ...SHARED_DRIVE_PARAMS }),
        );
        parent = res.data.parents?.[0] ?? null;
      } catch {
        parent = null;
      }
      cache.set(current, parent);
    }
    current = parent;
  }
  return false;
}

/**
 * Область пошуку. Дефолтний corpora='user' покриває тільки файли, які користувач
 * створив, відкривав або які розшарені йому напряму — файли спільного диска,
 * до яких він ще не звертався, у fullText-видачу не потрапляють.
 * Тому для теки у спільному диску шукаємо адресно (corpora='drive'), інакше — по всіх.
 */
async function searchScope(folderId?: string): Promise<{ corpora: string; driveId?: string }> {
  if (folderId) {
    try {
      const meta = await getFileMeta(folderId);
      const driveId = (meta as { driveId?: string | null }).driveId;
      if (driveId) return { corpora: 'drive', driveId };
    } catch {
      // тека недоступна або лежить у My Drive — падаємо у загальний пошук
    }
  }
  return { corpora: 'allDrives' };
}

/**
 * Пошук файлів за назвою і вмістом. `folderId` обмежує видачу текою та її підтеками
 * (фільтруємо по факту — див. isDescendantOf).
 */
export async function searchFiles(query: string, folderId?: string, limit = 20): Promise<DriveSearchHit[]> {
  const term = escapeName(String(query ?? '').trim());
  if (!term) return [];
  const drive = getDrive();
  const cap = Math.min(Math.max(limit, 1), 100);
  const scope = await searchScope(folderId);

  const q =
    `(name contains '${term}' or fullText contains '${term}')` +
    ` and mimeType != '${FOLDER_MIME}' and trashed = false`;

  const out: DriveSearchHit[] = [];
  const cache = new Map<string, string | null>();
  let pageToken: string | undefined;

  for (let page = 0; page < SEARCH_MAX_PAGES; page++) {
    const res: any = await withRetry(() =>
      drive.files.list({
        q,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: folderId ? 100 : cap,
        pageToken,
        ...scope,
        ...SHARED_DRIVE_PARAMS,
      }),
    );

    for (const f of res.data.files ?? []) {
      if (folderId && !(await isDescendantOf(f.id!, folderId, cache))) continue;
      out.push({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        webViewLink: f.webViewLink ?? undefined,
        modifiedTime: f.modifiedTime ?? undefined,
      });
      if (out.length >= cap) return out;
    }

    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken || !folderId) break;
  }

  return out;
}

/** Прочитати файл за id (обгортка над getFileMeta + readFileText — агент має лише id). */
export async function readFileById(
  fileId: string,
): Promise<{ id: string; name: string; mimeType: string; text: string | null }> {
  const meta = await getFileMeta(fileId);
  const info: DriveFileInfo = { id: meta.id!, name: meta.name!, mimeType: meta.mimeType! };
  const text = await readFileText(info);
  return { ...info, text };
}

export interface SheetRows {
  sheetTitle: string;
  header: string[];
  /** Рядки без заголовка. `rowNumber` — реальний номер рядка в аркуші (1-based), придатний для updateSheetRow. */
  rows: { rowNumber: number; values: string[] }[];
}

/**
 * Прочитати таблицю у структуровані рядки (на відміну від приватного readSheetText, що віддає текст для вектора).
 * `range` — A1 або назва аркуша; без нього беремо перший аркуш цілком.
 */
export async function readSheetRows(spreadsheetId: string, range?: string): Promise<SheetRows> {
  const sheets = getSheets();
  let target = range;
  let sheetTitle = range ?? '';

  if (!target) {
    const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId }));
    sheetTitle = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';
    target = `'${sheetTitle.replace(/'/g, "''")}'`;
  }

  const vr = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: target! }));
  const raw = (vr.data.values ?? []) as unknown[][];
  if (!raw.length) return { sheetTitle, header: [], rows: [] };

  const header = (raw[0] ?? []).map((c) => String(c ?? '').trim());
  const rows = raw
    .slice(1)
    .map((row, i) => ({ rowNumber: i + 2, values: (row ?? []).map((c) => String(c ?? '')) }))
    .filter((r) => r.values.some((v) => v.trim()));

  return { sheetTitle, header, rows };
}

/** Літера стовпця за 1-based індексом (1 → A, 27 → AA). */
function columnLetter(index: number): string {
  let n = index;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Перезаписати ОДИН рядок таблиці. Свідомо вузька операція: агент не має можливості
 * знести таблицю цілком (ТЗ §4.2 — тільки append/update конкретного рядка).
 */
export async function updateSheetRow(
  spreadsheetId: string,
  rowNumber: number,
  values: (string | number)[],
  sheetTitle?: string,
): Promise<void> {
  const row = Math.floor(Number(rowNumber));
  if (!Number.isFinite(row) || row < 2) {
    throw new Error(`updateSheetRow: rowNumber має бути >= 2 (рядок 1 — заголовки), отримано ${rowNumber}`);
  }
  if (!values.length) throw new Error('updateSheetRow: порожній values');

  const prefix = sheetTitle ? `'${sheetTitle.replace(/'/g, "''")}'!` : '';
  const range = `${prefix}A${row}:${columnLetter(values.length)}${row}`;
  await writeSheetValues(spreadsheetId, [values], range);
}

/**
 * Створити або оновити Google-документ у теці.
 * Без `fileId` — ідемпотентно за назвою (ensureDoc). З `fileId` — вміст замінюється цілком.
 */
export async function writeFile(
  folderId: string,
  filename: string,
  content: string,
  fileId?: string,
): Promise<{ fileId: string; created: boolean; webViewLink: string }> {
  const docs = getDocs();

  if (fileId) {
    const doc = await withRetry(() => docs.documents.get({ documentId: fileId }));
    const body = doc.data.body?.content ?? [];
    const endIndex = body.length ? body[body.length - 1].endIndex ?? 1 : 1;

    const requests: any[] = [];
    // Тіло документа завжди закінчується службовим \n — його видалити не можна, тому endIndex - 1.
    if (endIndex > 2) {
      requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
    }
    if (content) requests.push({ insertText: { location: { index: 1 }, text: content } });
    if (requests.length) {
      await withRetry(() => docs.documents.batchUpdate({ documentId: fileId, requestBody: { requests } }));
    }
    return { fileId, created: false, webViewLink: `https://docs.google.com/document/d/${fileId}/edit` };
  }

  const existing = await findChild(folderId, filename, DOC_MIME);
  const id = await ensureDoc(folderId, filename, existing ? undefined : content);

  // ensureDoc знайшов наявний документ — вміст треба замінити явно.
  if (existing) return writeFile(folderId, filename, content, existing);

  return { fileId: id, created: true, webViewLink: `https://docs.google.com/document/d/${id}/edit` };
}

/** Чи лежить файл безпосередньо в теці. Використовується для перевірки whitelist перед записом. */
export async function isFileInFolder(fileId: string, folderId: string): Promise<boolean> {
  const drive = getDrive();
  const res = await withRetry(() =>
    drive.files.get({ fileId, fields: 'parents', ...SHARED_DRIVE_PARAMS }),
  );
  return (res.data.parents ?? []).includes(folderId);
}
