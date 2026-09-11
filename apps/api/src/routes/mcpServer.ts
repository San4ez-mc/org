import { Router } from 'express';
import { prisma } from '@platform/db';
import { CANONICAL_DIVISIONS, findTemplate, templatesForPrompt } from '@platform/org-template';
import { classifyPostDivision } from '../services/classifyDivision';
import { vectorSearch } from '../services/vector';
import { loadDriveScope, resolveWriteTarget, type DriveScope } from '../services/driveScope';
import { runAsUser } from '@platform/drive';
import { publishStructureToDrive } from '../services/publishStructure';
import { generateInstructions } from '../services/generateInstructions';
import {
  searchFiles, readFileById, writeFile, ensureDocumentTemplate,
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

interface Ctx {
  companyId: string;
  /** Корінь структури компанії (орг-теки, індексація). Області асистента живуть у scope. */
  driveRootFolderId: string | null;
  /** Що читаємо і куди пишемо — з полів компанії, не з констант. */
  scope: DriveScope;
  crmSheetId: string | null;
  vectorToken: string | null;
}

/** Копія запису памʼяті у вектор-проєкт компанії — щоб шукалось змістом. */
async function indexMemoryNote(token: string, companyId: string, noteId: string, text: string): Promise<void> {
  await fetch(`${process.env.VECTOR_URL || 'http://127.0.0.1:4500'}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      collection: 'dynamic',
      chunks: [{
        source: 'Памʼять асистента',
        content: text,
        folderId: '',
        metadata: { companyId, noteId, kind: 'assistant-memory' },
      }],
    }),
    signal: AbortSignal.timeout(8000),
  });
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
    name: 'company_upsert',
    domain: 'org',
    description:
      'Зберегти, ЧИМ ЗАЙМАЄТЬСЯ компанія і який її ЦКП. Виклич одразу після того, як '
      + 'клієнт це розповів, ще до посад. Від цього залежить, куди платформа віднесе '
      + 'кожну посаду: без опису «рекрутер» у кадровій агенції виглядає як кадровик, '
      + 'а не як виробництво.',
    inputSchema: {
      type: 'object',
      properties: {
        mission: { type: 'string', description: 'Чим займається компанія: що продає, кому, у чому цінність. Одне-два речення.' },
        companyCkp: { type: 'string', description: 'ЦКП компанії — результат-іменник, за який платить клієнт.' },
        idealPicture: { type: 'string', description: 'Якою клієнт хоче бачити компанію за рік-два. Необовязково.' },
        crmSheetId: {
          type: 'string',
          description:
            'Google-таблиця, де клієнт веде клієнтів і кандидатів. Можна передати повне '
            + 'посилання — id витягнеться сам. Саме звідси працюють crm_search і crm_update: '
            + 'без цього поля вони не працюють, скільки б разів посилання не прозвучало в розмові.',
        },
      },
    },
  },
  {
    name: 'org_structure_read',
    domain: 'org',
    description:
      'Орг-структура компанії: відділення, відділи, посади і хто їх обіймає. Без аргументів — усе дерево. '
      + 'Повертає також gaps: чого в базі бракує. Звіряйся з ним перед тим, як казати клієнту, що щось зібрано: '
      + 'це факт із бази, а не твоя памʼять про розмову.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Необовязковий фільтр за назвою підрозділу чи посади' } },
    },
  },
  {
    name: 'org_unit_upsert',
    domain: 'org',
    description: 'Створити або перейменувати підрозділ чи посаду. Для видалення користуйся propose_change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Пропусти, щоб створити нову одиницю' },
        name: {
          type: 'string',
          description: 'ТІЛЬКИ назва посади чи підрозділу, без імені людини. «Ресерчер», а не «Ресерчер — Оксана Мельник».',
        },
        type: { type: 'string', enum: ['DIVISION', 'DEPARTMENT', 'SECTION', 'POST'] },
        parentId: { type: 'string', description: 'Батьківська одиниця; для відділення пропусти' },
        parentName: {
          type: 'string',
          description:
            'Назва відділу або секції, всередині якої це стоїть («Відділ виробництва»). '
            + 'Для секції обовʼязково. Для посади — лише якщо клієнт прямо сказав, де вона; '
            + 'інакше пропусти, платформа визначить сама.',
        },
        ckp: { type: 'string', description: 'Цінний кінцевий продукт' },
        holderName: {
          type: 'string',
          description: 'Хто обіймає посаду — прізвище й імʼя. Саме звідси беруться теки працівників на Диску. Порожньо = вакансія.',
        },
        reportsTo: {
          type: 'string',
          description:
            'Назва посади, якій ця підпорядковується («Засновниця»). Саме звідси береться '
            + 'підпорядкування в інструкції — без цього там стоятиме «потребує уточнення».',
        },
        divisionBoardNo: {
          type: 'number',
          description:
            'Не заповнюй: платформа сама визначає відділення за назвою посади та її ЦКП. '
            + 'Вкажи 1-7 лише тоді, коли клієнт прямо назвав відділення сам.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'document_template',
    domain: 'drive',
    description:
      'Заготовка документа під задачу: лонглист кандидатів, комерційна пропозиція, '
      + 'довідка про кандидата. Повертає структуру, якої треба дотриматись, і теку, '
      + 'куди класти готове. Якщо клієнт правив заготовку під себе — повертається ЙОГО '
      + 'версія: вона перевірена його ринком і краща за нашу. Без аргументів — список видів.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'longlist | proposal | candidate_brief. Пропусти, щоб побачити всі.' },
      },
    },
  },
  {
    name: 'process_read',
    domain: 'process',
    description: 'Бізнес-процеси компанії з кроками. Без аргументів — список усіх; з id — один процес повністю.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, query: { type: 'string' } },
    },
  },
  {
    name: 'process_upsert',
    domain: 'process',
    description: 'Створити або оновити бізнес-процес. steps — впорядкований масив кроків. Для видалення користуйся propose_change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Пропусти, щоб створити новий' },
        name: { type: 'string' },
        description: { type: 'string' },
        steps: { type: 'array', description: 'Кроки у форматі post / action / result', items: { type: 'object' } },
      },
      required: ['name'],
    },
  },
  {
    name: 'publish_structure',
    domain: 'process',
    description:
      'Перенести орг-структуру на Google Drive: створити оригінали посадових інструкцій, теки працівників '
      + 'і теки їхніх посад із ярликами на інструкції. Клич ПІСЛЯ того, як зібрав процеси, людей і посади — '
      + 'зазвичай наприкінці знайомства. Ідемпотентно: повторний виклик нічого не дублює.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'generate_instructions',
    domain: 'process',
    description:
      'Наповнити посадові інструкції змістом на основі описаних процесів і ЦКП посад. '
      + 'Клич ПІСЛЯ publish_structure. Довга операція — попередь, що це займе хвилину.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'instruction_read',
    domain: 'process',
    description: 'Посадові інструкції компанії: назва, посада, статус, посилання на документ.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
    },
  },
  {
    name: 'propose_change',
    domain: 'org',
    description: 'ЄДИНИЙ шлях для видалень і великих структурних змін. Нічого не змінює одразу — створює пропозицію, яку підтверджує людина в орг-платформі.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['delete_process', 'delete_org_unit', 'delete_instruction', 'archive_file', 'structure_change'],
        },
        targetId: { type: 'string', description: 'Що саме змінюємо' },
        reason: { type: 'string', description: 'Навіщо — це побачить людина при підтвердженні' },
        details: { type: 'object', description: 'Довільні деталі зміни' },
      },
      required: ['action', 'reason'],
    },
  },
  {
    name: 'memory_write',
    domain: 'memory',
    description: 'Запамʼятати стійкий факт: домовленість, побажання, заборону, стан пошуку. Пиши коротко й по суті — це переживе поточну розмову. Не дублюй те, що вже є.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Один факт одним-двома реченнями' },
        tag: { type: 'string', description: 'Напр. клієнт, домовленість, заборона' },
      },
      required: ['text'],
    },
  },
  {
    name: 'memory_read',
    domain: 'memory',
    description: 'Що вже відомо з попередніх розмов. Без query повертає найсвіжіше; з query шукає за змістом. Заглядай сюди на початку розмови і коли згадують минулі домовленості.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Про що згадати; порожній — останні записи' },
        limit: { type: 'number' },
      },
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

/**
 * Крок процесу: інтерфейс і решта платформи читають `postTitle`, а модель у промпті
 * оперує коротшим `post`. Зводимо до одного поля на записі — інакше процес, збережений
 * асистентом, показувався б на фронті без відповідального.
 */
function normalizeSteps(steps: unknown): unknown {
  if (!Array.isArray(steps)) return steps;
  return steps.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const { post, postTitle, ...rest } = s as Record<string, unknown>;
    // Модель пише виконавця так, як говорять: «Богдан (джуніор рекрутер)».
    // Ім'я відрізаємо: крок належить ПОСАДІ, і при зміні людини він має лишитись.
    let who = String(postTitle ?? post ?? '').trim();
    const inParens = who.match(/^[^(]*\(([^)]+)\)\s*$/);
    if (inParens) who = inParens[1].trim();
    return { ...rest, postTitle: who };
  });
}

/**
 * Кроки, чий виконавець не збігається з жодною посадою в структурі.
 *
 * Мовчазний розрив: у структурі «Молодший ресерчер», у кроці «джуніор рекрутер» —
 * і розділ «що робить покроково» в його інструкції виходить порожнім, хоча процес
 * описаний. Тому не мовчимо, а повертаємо моделі список неспівпадінь: вона одразу
 * бачить, які назви існують насправді, і виправляє.
 */
async function unmatchedStepPosts(companyId: string, steps: unknown): Promise<string[]> {
  if (!Array.isArray(steps) || !steps.length) return [];
  const posts = await prisma.orgUnit.findMany({
    where: { companyId, type: 'POST' },
    select: { name: true },
  });
  const names = posts.map((p) => p.name.toLowerCase());
  const bad = new Set<string>();
  for (const s of steps as { postTitle?: string }[]) {
    const who = String(s?.postTitle ?? '').trim().toLowerCase();
    if (!who) continue;
    if (!names.some((n) => n && (who.includes(n) || n.includes(who)))) bad.add(String(s.postTitle));
  }
  return [...bad];
}

/**
 * Канонічне відділення за номером — із гарантією, що є всі сім.
 *
 * Раніше створювалось тільки те, куди щойно поклали посаду, і компанія з трьома
 * людьми мала три відділення. Це не «менше зайвого», це неправда: сім відділень
 * у компанії є завжди, просто частину з них поки тягне власник. Порожнє
 * відділення на схемі — видиме питання «а хто це робить?»; відсутнє — жодного.
 */
async function ensureDivision(companyId: string, boardNo: number): Promise<string | null> {
  const have = await prisma.orgUnit.findMany({
    where: { companyId, type: 'DIVISION' },
    select: { id: true, boardNo: true },
  });
  const missing = CANONICAL_DIVISIONS.filter((c) => !have.some((h) => h.boardNo === c.boardNo));
  if (missing.length) {
    await prisma.orgUnit.createMany({
      data: missing.map((c) => ({
        companyId, type: 'DIVISION' as const, name: c.name, boardNo: c.boardNo, ckp: c.ckp,
        origin: 'CANONICAL',
      })),
      skipDuplicates: true,
    });
  }
  const found = await prisma.orgUnit.findFirst({
    where: { companyId, type: 'DIVISION', boardNo },
    select: { id: true },
  });
  return found?.id ?? null;
}

/** Канонічний відділ усередині відділення — створюємо так само ліниво. */
async function ensureDepartment(
  companyId: string,
  divisionId: string | null,
  name: string,
  ckp: string | null,
  origin: string | null,
): Promise<string | null> {
  if (!divisionId) return null;
  const found = await prisma.orgUnit.findFirst({
    where: { companyId, type: 'DEPARTMENT', parentId: divisionId, name },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await prisma.orgUnit.create({
    data: { companyId, type: 'DEPARTMENT', name, parentId: divisionId, ckp, origin },
    select: { id: true },
  });
  return created.id;
}

/**
 * Наявна одиниця з такою ж назвою. Тезки трапляються («Керівник відділу» у двох
 * відділах), тому за наявності кількох беремо ту, де та сама людина.
 */
async function findUnitByName(
  companyId: string,
  name: string,
  type: string,
): Promise<{ id: string } | null> {
  const found = await prisma.orgUnit.findMany({
    where: { companyId, type: type as any, name: { equals: name, mode: 'insensitive' } },
    select: { id: true, holderName: true },
  });
  if (!found.length) return null;
  return found[0];
}

/**
 * Чого бракує в базі компанії — рахуємо з даних, а не з памʼяті про розмову.
 *
 * На живому онбордингу асистентка підбила підсумок «пройшли майже все», хоча
 * підпорядкування не було записане в жодної з девʼяти посад. Вона не збрехала:
 * про підпорядкування говорили, і для неї блок був закритий. Але в структурі
 * порожньо, і в інструкціях там стояло б «потребує уточнення».
 *
 * Тому список прогалин повертається разом зі структурою: це факт із бази, який
 * не залежить від того, що асистентка памʼятає про розмову.
 */
async function collectGaps(ctx: Ctx): Promise<string[]> {
  const gaps: string[] = [];
  const [company, posts, processes] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { mission: true, companyCkp: true, crmSheetId: true },
    }),
    prisma.orgUnit.findMany({
      where: { companyId: ctx.companyId, type: 'POST' },
      select: { name: true, ckp: true, holderName: true, reportsToUnitId: true },
    }),
    prisma.process.findMany({
      where: { companyId: ctx.companyId },
      select: { name: true, steps: true },
    }),
  ]);

  if (!company?.mission) gaps.push('не записано, чим займається компанія (company_upsert: mission)');
  if (!company?.companyCkp) gaps.push('не записано ЦКП компанії (company_upsert: companyCkp)');
  if (!company?.crmSheetId) gaps.push('не вказано CRM-таблицю — crm_search без неї не працює (company_upsert: crmSheetId)');

  const noBoss = posts.filter((p) => !p.reportsToUnitId).map((p) => p.name);
  if (noBoss.length) gaps.push(`посади без підпорядкування (${noBoss.length}): ${noBoss.join(', ')}`);

  const noCkp = posts.filter((p) => !p.ckp?.trim()).map((p) => p.name);
  if (noCkp.length) gaps.push(`посади без ЦКП (${noCkp.length}): ${noCkp.join(', ')}`);

  const noSteps = processes
    .filter((x) => !Array.isArray(x.steps) || !(x.steps as unknown[]).length)
    .map((x) => x.name);
  if (noSteps.length) gaps.push(`процеси названі, але не описані кроками (${noSteps.length}): ${noSteps.join(', ')}`);

  if (!posts.length) gaps.push('у структурі немає жодної посади');
  if (!processes.length) gaps.push('не описано жодного процесу');

  return gaps;
}

/** Знайти посаду за назвою в межах компанії — модель оперує назвами, не id. */
async function resolveReportsTo(companyId: string, name: unknown): Promise<string | null> {
  const q = String(name ?? '').trim();
  if (!q) return null;
  const unit = await prisma.orgUnit.findFirst({
    where: { companyId, type: 'POST', name: { contains: q, mode: 'insensitive' } },
    select: { id: true },
  });
  return unit?.id ?? null;
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
      // scanFolderId порожній = весь диск клієнта. На область запису це не впливає.
      const files = await searchFiles(String(args?.query ?? ''), ctx.scope.scanFolderId, Number(args?.limit) || 20);
      return { count: files.length, files };
    }
    case 'drive_read':
      return readFileById(String(args?.fileId ?? ''));

    case 'drive_write': {
      // Перевірка серверна, а не в промпті: промпт модель може проігнорувати.
      const folderId = await resolveWriteTarget(ctx.scope, String(args?.folder ?? ''));
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

    case 'document_template': {
      const kind = String(args?.kind ?? '').trim();
      if (!kind) return { templates: templatesForPrompt() };

      const tpl = findTemplate(kind);
      if (!tpl) {
        throw new Error(`Немає заготовки «${kind}». Доступні:
${templatesForPrompt()}`);
      }
      if (!ctx.scope.writeFolderId) throw new Error('Для компанії не налаштована тека запису');

      // Заготовка живе документом у клієнта, а не рядком у промпті: правити
      // промпт може лише розробник, а документ на Диску — сама власниця.
      const doc = await ensureDocumentTemplate(ctx.scope.writeFolderId, tpl.title, tpl.skeleton);
      return {
        kind: tpl.kind,
        folder: tpl.folder,
        source: doc.own ? 'версія клієнта (правлена на Диску)' : 'базова заготовка платформи',
        editUrl: `https://docs.google.com/document/d/${doc.fileId}/edit`,
        structure: doc.text,
        note: 'Дотримайся цієї структури. Плейсхолдери у {{фігурних дужках}} заміни справжніми даними; '
          + 'де даних немає — напиши «Потребує уточнення», а не вигадуй.',
      };
    }

    case 'company_upsert': {
      const data: Record<string, string> = {};
      for (const f of ['mission', 'companyCkp', 'idealPicture'] as const) {
        const v = String(args?.[f] ?? '').trim();
        if (v) data[f] = v;
      }
      // Клієнт кидає посилання, а не id — витягуємо самі, інакше поле лишається
      // порожнім і crm_search мовчки не працює при «наче все сказано».
      const sheetRaw = String(args?.crmSheetId ?? '').trim();
      if (sheetRaw) {
        const m = sheetRaw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
        data.crmSheetId = m ? m[1] : sheetRaw;
      }
      if (!Object.keys(data).length) throw new Error('Нічого зберігати: вкажи mission, companyCkp або crmSheetId');
      const saved = await prisma.company.update({
        where: { id: ctx.companyId },
        data,
        select: { name: true, mission: true, companyCkp: true, crmSheetId: true },
      });
      return { ok: true, company: saved };
    }

    case 'org_structure_read': {
      const q = String(args?.query ?? '').trim().toLowerCase();
      const units = await prisma.orgUnit.findMany({
        where: { companyId: ctx.companyId },
        select: {
          id: true, name: true, type: true, parentId: true, ckp: true, isVacant: true,
          memberPosts: {
            where: { removedAt: null },
            select: { member: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: [{ type: 'asc' }, { orderNo: 'asc' }],
      });
      const shaped = units
        .map((u) => ({
          id: u.id, name: u.name, type: u.type, parentId: u.parentId, ckp: u.ckp,
          holders: u.memberPosts.map((mp) => [mp.member.firstName, mp.member.lastName].filter(Boolean).join(' ')),
          isVacant: u.isVacant,
        }))
        .filter((u) => !q || u.name.toLowerCase().includes(q));
      return { count: shaped.length, units: shaped, gaps: await collectGaps(ctx) };
    }

    case 'org_unit_upsert': {
      const unitName = String(args?.name ?? '').trim();
      if (!unitName) throw new Error('Поле name обовязкове');
      // Модель схильна вписувати людину в назву («Ресерчер — Оксана»), бо так
      // природніше говорити. Відрізаємо: тека працівника будується з holderName,
      // а посада має лишатись посадою, інакше при зміні людини поїде вся структура.
      const holder = String(args?.holderName ?? '').trim();

      if (args?.id) {
        const updated = await prisma.orgUnit.update({
          where: { id: String(args.id) },
          data: {
            name: unitName,
            ...(args?.ckp !== undefined && { ckp: args.ckp || null }),
            ...(args?.holderName !== undefined && { holderName: holder || null, isVacant: !holder }),
            ...(args?.reportsTo !== undefined && {
              reportsToUnitId: await resolveReportsTo(ctx.companyId, args.reportsTo),
            }),
          },
          select: { id: true, name: true, type: true, holderName: true },
        });
        return { ok: true, mode: 'update', unit: updated };
      }
      // Без батька посада «зависає» і при публікації падає в адміністративне
      // відділення. Якщо модель назвала номер відділення — підвʼязуємо до нього.
      const unitType = String(args?.type || 'POST');

      // Відділень рівно сім і вони канонічні. Дозволити моделі створювати свої
      // означає отримати «ТалантХаб» як відділення — саме це й сталось на аудиті,
      // коли вона обходила вимогу вказати номер.
      if (unitType === 'DIVISION') {
        throw new Error(
          'Відділення створювати не можна: їх рівно сім і вони однакові для всіх компаній. '
          + 'Заводь посаду (type=POST) і вкажи divisionBoardNo — відділення підставиться саме.',
        );
      }

      // Асистент не тримає id у голові й не читає структуру перед записом — він
      // просто називає посаду. Без пошуку за назвою кожне повторне інтервʼю
      // подвоювало штат: після другого проходу «Ресерчер» був у базі двічі.
      const twin = await findUnitByName(ctx.companyId, unitName, unitType);
      if (twin) {
        const updated = await prisma.orgUnit.update({
          where: { id: twin.id },
          data: {
            ...(args?.ckp !== undefined && { ckp: args.ckp || null }),
            ...(args?.holderName !== undefined && { holderName: holder || null, isVacant: !holder }),
            ...(args?.reportsTo !== undefined && {
              reportsToUnitId: await resolveReportsTo(ctx.companyId, args.reportsTo),
            }),
          },
          select: { id: true, name: true, type: true, holderName: true },
        });
        return { ok: true, mode: 'update', unit: updated };
      }

      let parentId = args?.parentId ? String(args.parentId) : null;

      // Батька модель називає словами — id вона не знає й не має знати.
      if (!parentId && args?.parentName) {
        const parent = await prisma.orgUnit.findFirst({
          where: {
            companyId: ctx.companyId,
            type: { in: ['DEPARTMENT', 'SECTION'] },
            name: { contains: String(args.parentName).trim(), mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (!parent) {
          throw new Error(
            `Підрозділу «${args.parentName}» у компанії немає. Заведи спершу його, `
            + 'або пропусти parentName — тоді посада ляже прямо на відділення.',
          );
        }
        parentId = parent.id;
      }

      // Секція живе всередині відділу і ніде більше: секція, підвішена на
      // відділення, — це відділ, просто названий іншим словом.
      if (unitType === 'SECTION' && !parentId) {
        throw new Error(
          'Секцію можна заводити тільки всередині відділу — вкажи parentName '
          + 'з назвою відділу. Якщо відділу ще немає, це не секція, а відділ.',
        );
      }

      const boardNo = Number(args?.divisionBoardNo) || 0;
      if (!parentId && boardNo >= 1 && boardNo <= 7) {
        parentId = await ensureDivision(ctx.companyId, boardNo);
      }

      // Куди належить посада — питання методології, а не памʼяті клієнта й не
      // здогадки моделі з одного рядка в описі поля. Класифікує платформа: у неї
      // є канон із ЦКП усіх відділень і відділів. Клієнта про це не питають ніколи.
      let placement: string | null = null;
      if (unitType === 'POST' && !parentId) {
        const guess = await classifyPostDivision(ctx.companyId, unitName, args?.ckp);
        const divisionId = await ensureDivision(ctx.companyId, guess.boardNo);
        parentId = guess.departmentName
          ? await ensureDepartment(
            ctx.companyId, divisionId, guess.departmentName, guess.departmentCkp, guess.departmentOrigin,
          )
          : divisionId;
        placement = `${guess.boardNo}. ${guess.divisionName}`
          + (guess.departmentName ? ` → ${guess.departmentName}` : ' (без відділу)')
          + ` (${guess.reason})`
          + (guess.departmentRejected ? ` Відділ не заводили: ${guess.departmentRejected}` : '');
      }

      // Підпорядкування модель називає словами («звітує Засновниці»), а в базі це
      // посилання на іншу посаду. Резолвимо за назвою — id вона не знає й не має знати.
      const reportsToUnitId = await resolveReportsTo(ctx.companyId, args?.reportsTo);

      const created = await prisma.orgUnit.create({
        data: {
          companyId: ctx.companyId,
          name: unitName,
          type: (args?.type || 'POST') as any,
          parentId,
          ckp: args?.ckp ? String(args.ckp) : null,
          holderName: holder || null,
          isVacant: !holder,
          reportsToUnitId,
        },
        select: { id: true, name: true, type: true, holderName: true },
      });
      // Куди саме лягла посада — повертаємо словами, щоб асистент міг сказати це
      // клієнту («віднесла до технічного, бо це те, за що платять замовники»)
      // і клієнт мав шанс заперечити, поки структура ще маленька.
      return { ok: true, mode: 'create', unit: created, ...(placement && { placement }) };
    }

    case 'process_read': {
      if (args?.id) {
        const one = await prisma.process.findFirst({
          where: { id: String(args.id), companyId: ctx.companyId },
          select: { id: true, name: true, description: true, steps: true, ownerUnitId: true },
        });
        if (!one) throw new Error('Процес не знайдено');
        return one;
      }
      const q = String(args?.query ?? '').trim().toLowerCase();
      const list = await prisma.process.findMany({
        where: { companyId: ctx.companyId },
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
      });
      const filtered = q ? list.filter((x) => x.name.toLowerCase().includes(q)) : list;
      return { count: filtered.length, processes: filtered };
    }

    case 'process_upsert': {
      const procName = String(args?.name ?? '').trim();
      if (!procName) throw new Error('Поле name обовязкове');
      const data: any = {
        name: procName,
        ...(args?.description !== undefined && { description: args.description || null }),
        ...(args?.steps !== undefined && { steps: normalizeSteps(args.steps) }),
      };
      if (args?.id) {
        const updated = await prisma.process.update({
          where: { id: String(args.id) }, data, select: { id: true, name: true },
        });
        return { ok: true, mode: 'update', process: updated };
      }
      // Той самий процес, описаний удруге, має уточнити наявний, а не лягти поруч:
      // дві «Основний рекрутинговий процес» у списку — це не історія змін, це сміття.
      const same = await prisma.process.findFirst({
        where: { companyId: ctx.companyId, name: { equals: procName, mode: 'insensitive' } },
        select: { id: true },
      });
      const unmatched = await unmatchedStepPosts(ctx.companyId, data.steps);
      const warn = unmatched.length
        ? {
          warning:
            `Ці виконавці кроків не збігаються з жодною посадою: ${unmatched.join(', ')}. `
            + 'Або заведи такі посади, або перепиши кроки під наявні назви — інакше в '
            + 'їхніх інструкціях розділ «що робить покроково» лишиться порожнім.',
        }
        : {};

      if (same) {
        const updated = await prisma.process.update({
          where: { id: same.id }, data, select: { id: true, name: true },
        });
        return { ok: true, mode: 'update', process: updated, ...warn };
      }
      const created = await prisma.process.create({
        data: { ...data, companyId: ctx.companyId }, select: { id: true, name: true },
      });
      return { ok: true, mode: 'create', process: created, ...warn };
    }

    case 'generate_instructions':
      return generateInstructions(ctx.companyId);

    case 'publish_structure':
      return publishStructureToDrive(ctx.companyId);

    case 'instruction_read': {
      const q = String(args?.query ?? '').trim().toLowerCase();
      const list = await prisma.instruction.findMany({
        where: { companyId: ctx.companyId },
        select: {
          id: true, title: true, status: true, driveDocId: true,
          postUnit: { select: { name: true } },
        },
        orderBy: { title: 'asc' },
      });
      const shaped = list
        .map((i) => ({
          id: i.id, title: i.title, status: i.status, post: i.postUnit?.name ?? null,
          url: i.driveDocId ? 'https://docs.google.com/document/d/' + i.driveDocId + '/edit' : null,
        }))
        .filter((i) => !q || i.title.toLowerCase().includes(q));
      return { count: shaped.length, instructions: shaped };
    }

    case 'propose_change': {
      // Нічого не виконуємо. Модель може помилитись, а видалення процесу чи
      // посади незворотне. Людина підтверджує в інтерфейсі орг-платформи.
      const proposal = await prisma.proposal.create({
        data: {
          companyId: ctx.companyId,
          type: 'STRUCTURE_CHANGE',
          payload: {
            action: String(args?.action ?? ''),
            targetId: args?.targetId ?? null,
            reason: String(args?.reason ?? ''),
            details: args?.details ?? {},
            source: 'assistant',
          },
          status: 'PENDING',
        },
        select: { id: true },
      });
      return {
        ok: true,
        proposalId: proposal.id,
        note: 'Створено пропозицію. Зміну буде застосовано лише після підтвердження людиною в орг-платформі.',
      };
    }

    case 'memory_write': {
      const text = String(args?.text ?? '').trim();
      if (!text) throw new Error('Порожній запис памʼяті');
      const tag = args?.tag ? String(args.tag).trim() : null;

      // Памʼять із однією й тією ж міткою переписуємо, а не додаємо поруч.
      // Прохання в промпті «не дублюй» модель не втримує: після двох інтервʼю
      // в памʼяті лежало чотири записи «інструменти» й два «стоп-лист», і на
      // питання «якою мовою писати клієнтам» знаходились дві різні відповіді.
      const prior = tag
        ? await prisma.assistantMemory.findFirst({
          where: { companyId: ctx.companyId, tag },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        : null;

      const note = prior
        ? await prisma.assistantMemory.update({
          where: { id: prior.id }, data: { text }, select: { id: true, createdAt: true },
        })
        : await prisma.assistantMemory.create({
          data: { companyId: ctx.companyId, text, tag },
          select: { id: true, createdAt: true },
        });

      // Копія у вектор — щоб памʼять шукалась змістом. Best-effort: якщо вектор
      // недоступний, запис усе одно збережено, і це головне.
      if (ctx.vectorToken) {
        void indexMemoryNote(ctx.vectorToken, ctx.companyId, note.id, text).catch(() => {});
      }
      return { ok: true, id: note.id, note: 'Запамʼятав.' };
    }

    case 'memory_read': {
      const limit = Math.min(Math.max(Number(args?.limit) || 10, 1), 50);
      const query = String(args?.query ?? '').trim();

      if (query && ctx.vectorToken) {
        const found = await vectorSearch(ctx.vectorToken, query, limit);
        const hits = (found?.results || []).filter((r: any) => r?.metadata?.kind === 'assistant-memory');
        if (hits.length) {
          return { mode: 'semantic', count: hits.length, notes: hits.map((h: any) => h.content) };
        }
      }

      const rows = await prisma.assistantMemory.findMany({
        where: {
          companyId: ctx.companyId,
          ...(query ? { text: { contains: query, mode: 'insensitive' as const } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { text: true, tag: true, createdAt: true },
      });
      return { mode: query ? 'text' : 'recent', count: rows.length, notes: rows };
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
const DOMAINS = ['drive', 'crm', 'org', 'process', 'memory'] as const;

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
        select: { id: true, driveRootFolderId: true, crmSheetId: true, vectorToken: true },
      });
      if (!company) return void fail(-32602, 'Компанію не знайдено');

      const wanted = TOOLS.find((t) => t.name === String(params?.name));
      if (!wanted || wanted.domain !== domain) {
        return void fail(-32602, `Інструмент ${params?.name} не належить домену ${domain}`);
      }

      const scope = await loadDriveScope(company.id);
      // Уся робота інструмента — в контексті цієї компанії: якщо в неї налаштоване
      // делегування, запити до Google підуть від імені її користувача.
      const data = await runAsUser(scope.impersonateUser, () =>
        callTool(String(params?.name), params?.arguments, {
          companyId: company.id,
          driveRootFolderId: company.driveRootFolderId,
          scope,
          crmSheetId: company.crmSheetId,
          vectorToken: company.vectorToken,
        }),
      );

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
