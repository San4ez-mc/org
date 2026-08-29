import { Router } from 'express';
import {
  searchFiles,
  readFileById,
  writeFile,
  readSheetRows,
  updateSheetRow,
  appendSheetValues,
  connectionInfo,
} from '@platform/drive';
import { loadDriveScope, resolveWriteTarget, assertFileWritable, withCompanyDrive } from '../services/driveScope';

/**
 * Інструменти асистента над Drive/Sheets (ТЗ Digital Hiring §0.1, §4).
 * Змонтовано під /api/drive у routes/index.ts — авторизація успадковується
 * від `api.use(requireApiSecret)`, окремого middleware тут не треба.
 *
 * Окремий файл, а не додаток до routes/index.ts (2200+ рядків) — щоб
 * контракт для воронки читався в одному місці.
 */
export const driveTools = Router();

type Handler = (req: any, res: any) => Promise<unknown>;

/** Обгортка: 400 на невалідний вхід, 502 на помилку Google, без падіння процесу. */
const route =
  (fn: Handler): Handler =>
  async (req, res) => {
    try {
      return await fn(req, res);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const status = /обовʼязков|має бути|не дозволена|не знайдено/i.test(msg) ? 400 : 502;
      res.status(status).json({ error: msg });
    }
  };

/**
 * Двигун Flows шле в тіло інструмента ЛИШЕ аргументи моделі — контекст воронки туди не потрапляє.
 * Тому сталий конфіг (sheetId, rootFolderId) передається в query URL-а, який рендериться шаблоном.
 */
function param(req: any, field: string): any {
  return req.body?.[field] ?? req.query?.[field];
}

function need(req: any, field: string): string {
  const v = param(req, field);
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(`Поле "${field}" обовʼязкове`);
  }
  return String(v).trim();
}

/**
 * Рядок таблиці з обʼєкта за назвами колонок.
 * Просити модель віддати масив у порядку колонок — надійний спосіб отримати
 * зсунуті дані, тому мапимо по заголовку.
 */
function recordToRow(header: string[], record: Record<string, unknown>): (string | number)[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const byKey = new Map(Object.entries(record).map(([k, v]) => [norm(k), v]));
  const unknown = [...byKey.keys()].filter((k) => !header.some((h) => norm(h) === k));
  if (unknown.length) {
    throw new Error(`Невідомі колонки: ${unknown.join(', ')}. Доступні: ${header.join(', ')}`);
  }
  return header.map((h) => {
    const v = byKey.get(norm(h));
    return v === undefined || v === null ? '' : String(v);
  });
}


/** Дані для екрана підключення: на яку адресу клієнт має розшарити теку. */
driveTools.get(
  '/connection-info',
  route(async (_req, res) => {
    res.json(connectionInfo());
  }),
);

// ── Drive ────────────────────────────────────────────────────────────────────

/** drive_search: пошук за назвою і вмістом; folderId звужує scope до теки з підтеками. */
driveTools.post(
  '/search',
  route(async (req, res) => {
    const query = need(req, 'query');
    const limit = Number(param(req, 'limit')) || 20;
    // Область читання — з картки компанії, а не з аргумента: інакше викликач сам вирішував би, що йому видно.
    const files = await withCompanyDrive(need(req, 'companyId'), (scope) =>
      searchFiles(query, scope.scanFolderId, limit),
    );
    res.json({ count: files.length, files });
  }),
);

/** drive_read: текст файлу за id (Docs / Sheets / text-*). */
driveTools.post(
  '/file/read',
  route(async (req, res) => {
    const fileId = need(req, 'fileId');
    const file = await readFileById(fileId);
    if (file.text === null) {
      return res.json({ ...file, note: 'Формат не підтримується для читання тексту (напр. pdf/docx).' });
    }
    res.json(file);
  }),
);

/** drive_write: створити або перезаписати документ у дозволеній теці. */
driveTools.post(
  '/file/write',
  route(async (req, res) => {
    const companyId = need(req, 'companyId');
    const folder = String(param(req, 'folder') ?? '');
    const filename = need(req, 'filename');
    const content = String(param(req, 'content') ?? '');
    const fileId = param(req, 'fileId') ? String(param(req, 'fileId')).trim() : undefined;

    const result = await withCompanyDrive(companyId, async (scope) => {
      const folderId = await resolveWriteTarget(scope, folder);
      // id прийшов ззовні — інакше через нього можна було б записати в будь-який файл на диску.
      if (fileId) await assertFileWritable(folderId, fileId);
      return writeFile(folderId, filename, content, fileId);
    });
    res.json({ ...result, folder, filename });
  }),
);

// ── Sheets (CRM) ─────────────────────────────────────────────────────────────

/**
 * crm_search: рядки таблиці. `query` фільтрує на боці платформи —
 * щоб у контекст агента не летіла вся таблиця (ТЗ §4.1).
 */
driveTools.post(
  '/sheet/read',
  route(async (req, res) => {
    const sheetId = need(req, 'sheetId');
    const range = param(req, 'range') ? String(param(req, 'range')) : undefined;
    const query = param(req, 'query') ? String(param(req, 'query')).trim().toLowerCase() : '';
    const limit = Number(param(req, 'limit')) || 50;

    const sheet = await readSheetRows(sheetId, range);
    let rows = sheet.rows;
    if (query) {
      rows = rows.filter((r) => r.values.some((v) => v.toLowerCase().includes(query)));
    }

    res.json({
      sheetTitle: sheet.sheetTitle,
      header: sheet.header,
      matched: rows.length,
      rows: rows.slice(0, limit),
    });
  }),
);

/**
 * crm_update: один ендпоінт для агента — є `rowNumber` → оновлюємо той рядок, немає → додаємо новий.
 * Приймає або `record` (обʼєкт за назвами колонок, надійніше для моделі), або сирий `values`.
 * Перезапису всієї таблиці немає за побудовою (ТЗ §4.2).
 */
driveTools.post(
  '/sheet/row',
  route(async (req, res) => {
    const sheetId = need(req, 'sheetId');
    const sheetTitle = param(req, 'sheetTitle') ? String(param(req, 'sheetTitle')) : undefined;
    const rowNumberRaw = param(req, 'rowNumber');
    const record = req.body?.record;
    let values = req.body?.values;

    if (record && typeof record === 'object' && !Array.isArray(record)) {
      const sheet = await readSheetRows(sheetId, sheetTitle);
      if (!sheet.header.length) throw new Error('У таблиці немає рядка заголовків — не можу зіставити record');
      values = recordToRow(sheet.header, record as Record<string, unknown>);
    }
    if (!Array.isArray(values) || !values.length) {
      throw new Error('Треба передати або "record" (обʼєкт за колонками), або непорожній "values"');
    }

    if (rowNumberRaw !== undefined && rowNumberRaw !== null && String(rowNumberRaw).trim() !== '') {
      const rowNumber = Number(rowNumberRaw);
      await updateSheetRow(sheetId, rowNumber, values, sheetTitle);
      return res.json({ ok: true, mode: 'update', rowNumber, columns: values.length });
    }

    const range = sheetTitle ? `'${sheetTitle.replace(/'/g, "''")}'!A1` : 'A1';
    await appendSheetValues(sheetId, [values], range);
    res.json({ ok: true, mode: 'append', columns: values.length });
  }),
);
