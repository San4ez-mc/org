import { Router } from 'express';
import { prisma } from '@platform/db';
import {
  searchFiles, readFileById, writeFile,
  readSheetRows, updateSheetRow, appendSheetValues,
} from '@platform/drive';

/**
 * MCP-сервер орг-платформи: один каталог інструментів для всіх ботів екосистеми.
 *
 * Навіщо саме MCP, а не свій формат: список інструментів перестає дублюватись у
 * кожній воронці. Додали можливість тут — її бачать усі боти, без правок воронок.
 * А оскільки формат стандартний, згодом можна віддати цей же URL напряму в
 * Anthropic MCP-конектор, нічого не переписуючи.
 *
 * Транспорт — JSON-RPC 2.0 поверх одного POST. Методи: `initialize`, `tools/list`, `tools/call`.
 *
 * Прив'язка до компанії — заголовком `x-company-id`, а НЕ аргументом інструмента.
 * Так модель ніколи не бачить і не вигадує id теки чи таблиці: сервер бере їх із
 * картки компанії. Модель оперує лише змістом.
 */
export const mcpServer = Router();

const SECRET = process.env.MCP_TOOLS_SECRET || '';

/** Теки, у які асистенту дозволено писати. `01_База_знань` навмисно відсутня. */
const WRITABLE = /^0[2345]_/;

interface Ctx {
  companyId: string;
  driveRootFolderId: string | null;
  crmSheetId: string | null;
}

const TOOLS = [
  {
    name: 'drive_search',
    domain: 'drive',
    description: 'Пошук файлів на Google Drive компанії за назвою і вмістом. Повертає назву, id, посилання, дату зміни.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Що шукати' },
        limit: { type: 'number', description: 'Скільки результатів, за замовчуванням 20' },
      },
      required: ['query'],
    },
  },
  {
    name: 'drive_read',
    domain: 'drive',
    description: 'Прочитати текст файлу з Drive за його id. Працює для Google Docs, таблиць і текстових файлів.',
    inputSchema: {
      type: 'object',
      properties: { fileId: { type: 'string' } },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_write',
    domain: 'drive',
    description: 'Створити або перезаписати документ на Drive компанії. Тека — одна з дозволених для запису.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Напр. 04_Згенеровано' },
        filename: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['folder', 'filename', 'content'],
    },
  },
  {
    name: 'crm_search',
    domain: 'crm',
    description: 'Подивитись CRM-таблицю компанії. Порожній query повертає всі рядки й назви колонок. Кожен рядок має rowNumber для crm_update.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Фільтр; порожній рядок — уся таблиця' } },
      required: ['query'],
    },
  },
  {
    name: 'crm_update',
    domain: 'crm',
    description: 'Оновити або додати запис у CRM. З rowNumber — оновлює той рядок, без нього — додає новий. record — обʼєкт за назвами колонок.',
    inputSchema: {
      type: 'object',
      properties: {
        rowNumber: { type: 'number' },
        record: { type: 'object' },
      },
      required: ['record'],
    },
  },
];

async function resolveFolder(rootId: string, name: string): Promise<string> {
  const { findFolderByName } = await import('@platform/drive');
  const id = await findFolderByName(rootId, name);
  if (!id) throw new Error(`Теку "${name}" не знайдено під коренем компанії`);
  return id;
}

function recordToRow(header: string[], record: Record<string, unknown>): string[] {
  const norm = (x: string) => x.trim().toLowerCase();
  const byKey = new Map(Object.entries(record).map(([k, v]) => [norm(k), v]));
  const unknown = [...byKey.keys()].filter((k) => !header.some((h) => norm(h) === k));
  if (unknown.length) throw new Error(`Невідомі колонки: ${unknown.join(', ')}. Доступні: ${header.join(', ')}`);
  return header.map((h) => {
    const v = byKey.get(norm(h));
    return v === undefined || v === null ? '' : String(v);
  });
}

async function callTool(name: string, args: any, ctx: Ctx): Promise<unknown> {
  const needDrive = () => {
    if (!ctx.driveRootFolderId) throw new Error('У компанії не підключена тека на Google Drive');
    return ctx.driveRootFolderId;
  };
  const needSheet = () => {
    if (!ctx.crmSheetId) throw new Error('У компанії не вказана CRM-таблиця');
    return ctx.crmSheetId;
  };

  switch (name) {
    case 'drive_search': {
      const files = await searchFiles(String(args?.query ?? ''), needDrive(), Number(args?.limit) || 20);
      return { count: files.length, files };
    }
    case 'drive_read':
      return readFileById(String(args?.fileId ?? ''));

    case 'drive_write': {
      const folder = String(args?.folder ?? '');
      // Whitelist серверний, а не в промпті: промпт модель може проігнорувати.
      if (!WRITABLE.test(folder)) {
        throw new Error(`Тека "${folder}" не дозволена для запису. Доступні: 02_, 03_, 04_, 05_`);
      }
      const folderId = await resolveFolder(needDrive(), folder);
      return writeFile(folderId, String(args?.filename ?? ''), String(args?.content ?? ''));
    }

    case 'crm_search': {
      const sheet = await readSheetRows(needSheet());
      const q = String(args?.query ?? '').trim().toLowerCase();
      const rows = q
        ? sheet.rows.filter((r) => r.values.some((v) => v.toLowerCase().includes(q)))
        : sheet.rows;
      return { header: sheet.header, count: rows.length, rows };
    }

    case 'crm_update': {
      const sheetId = needSheet();
      const sheet = await readSheetRows(sheetId);
      if (!sheet.header.length) throw new Error('У таблиці немає рядка заголовків');
      const values = recordToRow(sheet.header, (args?.record ?? {}) as Record<string, unknown>);
      const rowNumber = args?.rowNumber;
      if (rowNumber !== undefined && rowNumber !== null && String(rowNumber).trim() !== '') {
        await updateSheetRow(sheetId, Number(rowNumber), values, sheet.sheetTitle);
        return { ok: true, mode: 'update', rowNumber: Number(rowNumber) };
      }
      const range = `'${sheet.sheetTitle.replace(/'/g, "''")}'!A1`;
      await appendSheetValues(sheetId, [values], range);
      return { ok: true, mode: 'append' };
    }

    default:
      throw new Error(`Невідомий інструмент: ${name}`);
  }
}

/**
 * Домени — окремі каталоги на одному сервері. Воронка підписується лише на потрібні,
 * і схеми чужих доменів не з'їдають її контекст: асистенту рекрутера інструменти
 * редагування орг-структури не потрібні.
 */
const DOMAINS = ['drive', 'crm', 'org', 'process'] as const;

mcpServer.post('/:domain', async (req, res) => {
  // Секрет обовʼязковий: порожнє значення означає «не налаштовано», і тоді
  // сервер не відповідає нікому — краще мовчати, ніж відкрити каталог усім.
  if (!SECRET || req.header('x-mcp-secret') !== SECRET) {
    return void res.status(401).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32001, message: 'unauthorized' } });
  }

  const { id = null, method, params } = req.body || {};
  const ok = (result: unknown) => res.json({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => res.json({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    if (method === 'initialize') {
      return void ok({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: `fineko-org-${req.params.domain}`, version: '1.0.0' },
      });
    }

    const domain = String(req.params.domain || '');
    if (!DOMAINS.includes(domain as any)) return void fail(-32602, `Невідомий домен: ${domain}`);

    if (method === 'tools/list') {
      return void ok({ tools: TOOLS.filter((t) => t.domain === domain).map(({ domain: _d, ...t }) => t) });
    }

    if (method === 'tools/call') {
      const companyId = req.header('x-company-id') || '';
      if (!companyId) return void fail(-32602, 'Заголовок x-company-id обовʼязковий');

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, driveRootFolderId: true, crmSheetId: true },
      });
      if (!company) return void fail(-32602, 'Компанію не знайдено');

      const wanted = TOOLS.find((t) => t.name === String(params?.name));
      if (!wanted || wanted.domain !== domain) {
        return void fail(-32602, `Інструмент ${params?.name} не належить домену ${domain}`);
      }

      const data = await callTool(String(params?.name), params?.arguments, {
        companyId: company.id,
        driveRootFolderId: company.driveRootFolderId,
        crmSheetId: company.crmSheetId,
      });

      // MCP віддає результат як content-блоки; текст із JSON читається моделлю нормально.
      return void ok({ content: [{ type: 'text', text: JSON.stringify(data) }], isError: false });
    }

    return void fail(-32601, `Метод ${method} не підтримується`);
  } catch (err) {
    // Помилку інструмента віддаємо як результат із isError, а не як помилку протоколу:
    // так модель бачить причину і може виправитись, а не отримує глухий збій.
    if (method === 'tools/call') {
      return void ok({ content: [{ type: 'text', text: String((err as Error).message) }], isError: true });
    }
    return void fail(-32603, String((err as Error).message));
  }
});
