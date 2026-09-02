import {
  ensureFolder,
  ensureSpreadsheet,
  ensureDoc,
  ensureShortcut,
  writeSheetValues,
  setRowBackground,
  driveFolderUrl,
  type RowColor,
} from './drive';
import {
  CANONICAL_DIVISIONS,
  DIVISION_PAEI,
  PAEI_ROLES,
  instructionSkeleton,
} from '@platform/org-template';

/**
 * Побудова структури папок компанії (модель погоджена з власником 2026-09-01,
 * повний опис — ШАБЛОН_структури_папок.md).
 *
 * Два принципи, які й визначають усе інше:
 *
 * 1. **На старті створюється лише скелет.** Раніше будувалися теки під усі 28 посад
 *    канонічної схеми — для компанії з трьох людей це 28 порожніх папок і 28 фіктивних
 *    інструкцій. Тепер відділи, посади й папки працівників добудовує ШІ-агент після
 *    інтерв'ю, коли відомо, що в компанії реально є.
 *
 * 2. **Одиниця — ЛЮДИНА, не посада.** Одна людина може обіймати кілька посад; папка
 *    на посаду вимагала б дублювати її в двох місцях. Тому папки працівників лежать
 *    окремо від семи відділень, а посади — всередині людини.
 */

// ── Назви (єдине місце; змінювати тут, а не по коду) ─────────────────────────
const DIV_BUILD = 1; // Відділення побудови — туди платформа пише свій продукт
const DEPT_PERSONNEL = 'Відділ направлення та персоналу';
const HIRING = 'Найм, вакансії';
const REGULATIONS = 'Регламенти та посадові інструкції';
const ORGSTRUCTURE = 'Оргструктура';
const PROCESSES = 'Бізнес процеси';
const EMPLOYEES = 'Папки працівників';
const SHARED = 'Спільні документи';
const ARCHIVE = 'Архів';
const POSTS_IN_EMPLOYEE = 'Посадові інструкції';
const WORK_FOLDER = 'Робоча папка';

const SHARED_SUBFOLDERS = ['Бренд, айдентика', 'Політики компанії', 'Стратегія, задумка, історія'];

const RULES_DOC_NAME = 'Правила створення посадових інструкцій';
const RULES_TEXT = `Правила створення посадових інструкцій

1. Одна посада — один оригінал інструкції. Оригінали зберігаються ТІЛЬКИ у Відділенні побудови → «${REGULATIONS}». У папках працівників лежать лише ярлики.
2. Кожна інструкція описує: ЦКП посади, зону відповідальності, покрокові дії, стандарти якості, звітність.
3. Зміни вносяться лише в оригінал. Усі, хто тримає цю посаду, бачать зміни одразу — через ярлик.
4. Статус (чернетка / чинна) живе в платформі, а не в назві теки. Чернетка — це інструкція, на яку ще не опубліковано ярлики.
5. Виведена з обігу інструкція переноситься в «${ARCHIVE}», а не видаляється.
6. Мова — проста, дієслівна, без води. Формат однаковий для всіх посад.
`;

// Каркас беремо з org-template: структура інструкції — методологія, вона має бути
// одна для всіх компаній і мінятись в одному місці, а не тут у рядку.
const INSTRUCTION_DRAFT = (postName: string, ckp: string) => instructionSkeleton(postName, ckp);

/** Шлях до вузлів, які платформа використовує далі. Щоб не шукати їх щоразу наново. */
export interface CompanySkeleton {
  companyFolderId: string;
  url: string;
  /** Куди складати оригінали інструкцій (усередині — дерево 7 відділень, ліниво). */
  regulationsRootId: string;
  /** Тека вакансій: усе, що передує найму. */
  hiringRootId: string;
  /** Контейнер папок працівників. */
  employeesRootId: string;
  orgSheetId: string;
  journalSheetId: string;
}

/** Сумісність зі старими викликами (agent.ts, scripts/create-company.ts). */
export type BuildResult = CompanySkeleton;

function divisionLabel(boardNo: number): string {
  const div = CANONICAL_DIVISIONS.find((d) => d.boardNo === boardNo)!;
  return `${div.boardNo}. ${div.name}`;
}

/**
 * Базовий скелет компанії. Ідемпотентний: повторний виклик нічого не дублює,
 * бо всі ensure* спершу шукають за назвою.
 */
export async function buildCompanyStructure(rootId: string, companyName: string): Promise<CompanySkeleton> {
  return buildSkeletonInFolder(await ensureFolder(rootId, companyName));
}

/**
 * Той самий скелет, але у ВЖЕ наявній теці — коли її створив клієнт або платформа
 * раніше. Без цього довелося б класти структуру в підтеку з назвою компанії,
 * і виходило б «Digital Hiring — структура / Digital Hiring / 7 відділень».
 */
export async function buildSkeletonInFolder(company: string): Promise<CompanySkeleton> {

  // Сім відділень — каркас методології, однаковий для будь-якого бізнесу.
  // Відділи всередині них НЕ створюємо: вони залежать від інтерв'ю з клієнтом.
  const divisionFolders = new Map<number, string>();
  for (const div of [...CANONICAL_DIVISIONS].sort((a, b) => a.boardNo - b.boardNo)) {
    divisionFolders.set(div.boardNo, await ensureFolder(company, `${div.boardNo}. ${div.name}`));
  }

  // Єдиний відділ у скелеті: саме сюди платформа пише свій продукт — інструкції й оргсхему.
  const personnel = await ensureFolder(divisionFolders.get(DIV_BUILD)!, DEPT_PERSONNEL);
  const hiringRoot = await ensureFolder(personnel, HIRING);
  const regulationsRoot = await ensureFolder(personnel, REGULATIONS);
  await ensureFolder(regulationsRoot, ARCHIVE);
  await ensureDoc(regulationsRoot, RULES_DOC_NAME, RULES_TEXT);

  const orgStructure = await ensureFolder(personnel, ORGSTRUCTURE);
  await ensureFolder(orgStructure, PROCESSES);
  const orgSheet = await ensureSpreadsheet(orgStructure, 'Орг.схема');
  await ensureSpreadsheet(orgStructure, 'Матриця функцій');
  const journalSheet = await ensureSpreadsheet(orgStructure, 'Журнал');

  // Папки працівників — окремо від відділень (людина може мати кілька посад).
  const employeesRoot = await ensureFolder(company, EMPLOYEES);
  await ensureFolder(employeesRoot, ARCHIVE);

  const shared = await ensureFolder(company, SHARED);
  for (const name of SHARED_SUBFOLDERS) await ensureFolder(shared, name);

  // «Список працівників» свідомо НЕ створюємо: люди й посади живуть в орг-системі,
  // а копія на Диску одразу почала б розходитися з нею.

  await fillOrgSheet(orgSheet);
  await writeSheetValues(journalSheet, [['Дата', 'Дія', 'Обʼєкт', 'Деталі', 'Хто']]);

  return {
    companyFolderId: company,
    url: driveFolderUrl(company),
    regulationsRootId: regulationsRoot,
    hiringRootId: hiringRoot,
    employeesRootId: employeesRoot,
    orgSheetId: orgSheet,
    journalSheetId: journalSheet,
  };
}

/** Оргсхема з PAEI-кольорами Адізеса — довідник, а не структура тек. */
async function fillOrgSheet(sheetId: string): Promise<void> {
  const rows: (string | number)[][] = [['№', 'Відділення', 'Відділ', 'ЦКП', 'PAEI', 'Роль (Адізес)']];
  const colors: RowColor[] = [];
  let idx = 1; // 0 — заголовок

  for (const div of CANONICAL_DIVISIONS) {
    const role = DIVISION_PAEI[div.boardNo];
    const meta = PAEI_ROLES[role];
    rows.push([div.boardNo, div.name, '', div.ckp, role, meta.name]);
    colors.push({ startRow: idx, endRow: idx + 1, rgb: meta.color });
    idx++;
    for (const dept of div.departments) {
      rows.push([div.boardNo, div.name, dept.name, dept.ckp, role, meta.name]);
      colors.push({ startRow: idx, endRow: idx + 1, rgb: meta.color });
      idx++;
    }
  }

  await writeSheetValues(sheetId, rows);
  await setRowBackground(sheetId, colors, 6);
}

/**
 * Оригінал інструкції у Відділенні побудови. Дерево 7 відділень усередині
 * «Регламенти» створюється ЛІНИВО — лише під ту гілку, для якої з'явилась інструкція.
 * Інакше поруч із сімома справжніми відділеннями стояли б сім порожніх двійників.
 */
export async function ensureInstructionOriginal(
  regulationsRootId: string,
  boardNo: number,
  deptName: string | null,
  postName: string,
  ckp: string,
): Promise<string> {
  const divFolder = await ensureFolder(regulationsRootId, divisionLabel(boardNo));
  const parent = deptName ? await ensureFolder(divFolder, deptName) : divFolder;
  return ensureDoc(parent, `${postName} — Інструкція`, INSTRUCTION_DRAFT(postName, ckp));
}

/**
 * Папка працівника. Назву передає викликач із орг-структури (прізвище першим) —
 * пакет не вигадує форматування імен сам.
 */
export async function ensureEmployeeFolder(employeesRootId: string, personName: string): Promise<string> {
  const folder = await ensureFolder(employeesRootId, personName);
  await ensureFolder(folder, POSTS_IN_EMPLOYEE);
  await ensureFolder(folder, WORK_FOLDER);
  return folder;
}

/**
 * Посада всередині папки працівника: ярлик на оригінал + звітність саме цієї посади.
 *
 * ⚠️ Ярлик Google Drive НЕ дає прав. Якщо працівник не має доступу до оригіналу,
 * він побачить ярлик і «Потрібен доступ». Права роздає платформа окремо, за орг-структурою.
 */
export async function ensurePostInEmployeeFolder(
  employeeFolderId: string,
  postName: string,
  instructionDocId: string,
  withReport = false,
): Promise<string> {
  const postsRoot = await ensureFolder(employeeFolderId, POSTS_IN_EMPLOYEE);
  const postFolder = await ensureFolder(postsRoot, postName);
  await ensureShortcut(postFolder, `Посадова інструкція — ${postName}`, instructionDocId);

  // Звітність — на посаду, а не на людину: коли посади розійдуться між двома
  // працівниками, вона поїде разом зі своєю посадою. На старті не створюємо.
  if (withReport) {
    const report = await ensureSpreadsheet(postFolder, 'Звітність');
    await writeSheetValues(report, [['Дата', 'Показник', 'Значення', 'Коментар']]);
  }
  return postFolder;
}

/**
 * Тека вакансії — усе, що передує найму. Лишається й після найму: це історія пошуку
 * і готовий матеріал на наступний раз, тож належить HR-функції, а не людині.
 */
export async function ensureVacancyFolder(hiringRootId: string, postName: string): Promise<string> {
  const folder = await ensureFolder(hiringRootId, postName);
  await ensureFolder(folder, 'Кандидати');
  await ensureFolder(folder, 'Навчальні матеріали');
  return folder;
}

/**
 * Додати посаду компанії: оригінал інструкції у Побудові, і — якщо вказано працівника —
 * ярлик у його папці. Без працівника створюється лише оригінал (вакантна посада).
 */
export async function addCompanyPost(
  companyFolderId: string,
  boardNo: number,
  title: string,
  ckp: string,
  personName?: string,
): Promise<string> {
  const buildDivision = await ensureFolder(companyFolderId, divisionLabel(DIV_BUILD));
  const personnel = await ensureFolder(buildDivision, DEPT_PERSONNEL);
  const regulationsRoot = await ensureFolder(personnel, REGULATIONS);

  const doc = await ensureInstructionOriginal(regulationsRoot, boardNo, null, title, ckp);
  if (!personName) return doc;

  const employeesRoot = await ensureFolder(companyFolderId, EMPLOYEES);
  const employee = await ensureEmployeeFolder(employeesRoot, personName);
  await ensurePostInEmployeeFolder(employee, title, doc);
  return doc;
}
