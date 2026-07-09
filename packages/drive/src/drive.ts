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
