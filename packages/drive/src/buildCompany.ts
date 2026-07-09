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
  POSTS_CONTAINER_NAME,
  DIVISION_PAEI,
  PAEI_ROLES,
} from '@platform/org-template';

const RULES_DOC_NAME = 'Правила створення посадових інструкцій';
const INSTRUCTIONS_ORIGINALS_FOLDER = 'Посадові інструкції';
const WORK_FOLDERS = 'Робочі папки';
const ARCHIVE = 'Архів';

const RULES_TEXT = `Правила створення посадових інструкцій

1. Одна посада — один оригінал інструкції. Оригінали зберігаються ТІЛЬКИ тут, у Відділенні побудови → «Посадові інструкції». У папках посад лежать лише ярлики (перегляд).
2. Кожна інструкція описує: ЦКП посади, зону відповідальності, покрокові дії, стандарти якості, звітність.
3. Зміни вносяться лише в оригінал. Усі, хто тримає цю посаду, отримують зміни автоматично (через ярлик).
4. Пов'язані інструкції: при зміні перевіряй, чи не треба оновити суміжні — платформа підкаже.
5. Мова — проста, дієслівна, без води. Формат однаковий для всіх посад.
`;

const INSTRUCTION_DRAFT = (postName: string, ckp: string) =>
  `Посадова інструкція — ${postName}

ЦКП (Цінний Кінцевий Продукт): ${ckp}

1. Зона відповідальності: (чернетка — заповнить ШІ під конкретний бізнес)
2. Основні дії:
3. Стандарти якості:
4. Звітність:
`;

interface PostRef {
  divisionLabel: string;
  deptName: string | null;
  postName: string;
  ckp: string;
}

async function buildPostUnit(containerFolderId: string, originalsRootId: string, ref: PostRef) {
  const postsContainer = await ensureFolder(containerFolderId, POSTS_CONTAINER_NAME);
  const postFolder = await ensureFolder(postsContainer, ref.postName);

  // Оригінал інструкції у Побудові (дзеркало оргсхеми)
  const divOriginals = await ensureFolder(originalsRootId, ref.divisionLabel);
  const originalParent = ref.deptName ? await ensureFolder(divOriginals, ref.deptName) : divOriginals;
  const originalDoc = await ensureDoc(
    originalParent,
    `${ref.postName} — Інструкція`,
    INSTRUCTION_DRAFT(ref.postName, ref.ckp),
  );

  // У папці посади — лише ярлик на оригінал + робочі елементи
  await ensureShortcut(postFolder, `Посадова інструкція — ${ref.postName}`, originalDoc);
  await ensureFolder(postFolder, 'Доступні документи');
  const access = await ensureSpreadsheet(postFolder, 'Доступи');
  const report = await ensureSpreadsheet(postFolder, 'Звітність');
  await writeSheetValues(access, [['Google пошта', 'Папка', 'Доступ (✓)']]);
  await writeSheetValues(report, [['Дата', 'Показник', 'Значення', 'Коментар']]);

  return postFolder;
}

/**
 * Додати бізнес-специфічну посаду під відповідне відділення (за boardNo).
 * Оригінал інструкції — у Побудові, у папці посади — ярлик. Ідемпотентно.
 */
export async function addCompanyPost(
  companyFolderId: string,
  boardNo: number,
  title: string,
  ckp: string,
): Promise<string> {
  const div = CANONICAL_DIVISIONS.find((d) => d.boardNo === boardNo) ?? CANONICAL_DIVISIONS.find((d) => d.boardNo === 7)!;
  const divisionLabel = `${div.boardNo}. ${div.name}`;
  const divFolder = await ensureFolder(companyFolderId, divisionLabel);

  const pobudova = CANONICAL_DIVISIONS.find((d) => d.boardNo === 1)!;
  const pobudovaFolder = await ensureFolder(companyFolderId, `${pobudova.boardNo}. ${pobudova.name}`);
  const originalsRoot = await ensureFolder(pobudovaFolder, INSTRUCTIONS_ORIGINALS_FOLDER);

  return buildPostUnit(divFolder, originalsRoot, { divisionLabel, deptName: null, postName: title, ckp });
}

export interface BuildResult {
  companyFolderId: string;
  url: string;
  orgSheetId: string;
  staffSheetId: string;
  journalSheetId: string;
}

/**
 * Створює під кореневою папкою повну структуру компанії за уточненою моделлю:
 *  - Оригінали інструкцій у Побудові, у папках посад — ярлики
 *  - Робочі папки (+Архів)
 *  - Дашборд: Оргсхема + Персонал
 */
export async function buildCompanyStructure(rootId: string, companyName: string): Promise<BuildResult> {
  const company = await ensureFolder(rootId, companyName);

  // Відділення побудови — тримає оригінали інструкцій і правила
  const pobudova = CANONICAL_DIVISIONS.find((d) => d.boardNo === 1)!;
  const pobudovaLabel = `${pobudova.boardNo}. ${pobudova.name}`;
  const pobudovaFolder = await ensureFolder(company, pobudovaLabel);
  const originalsRoot = await ensureFolder(pobudovaFolder, INSTRUCTIONS_ORIGINALS_FOLDER);
  await ensureDoc(pobudovaFolder, RULES_DOC_NAME, RULES_TEXT);

  // Робочі папки + Архів
  const workRoot = await ensureFolder(company, WORK_FOLDERS);
  await ensureFolder(workRoot, ARCHIVE);

  // Дашборд: Оргсхема (з PAEI-кольорами Адізеса) + Персонал + Журнал
  const orgSheet = await ensureSpreadsheet(company, 'Оргсхема');
  const staffSheet = await ensureSpreadsheet(company, 'Персонал');
  const journalSheet = await ensureSpreadsheet(company, 'Журнал');

  const orgRows: (string | number)[][] = [['№', 'Відділення', 'Відділ', 'ЦКП', 'PAEI', 'Роль (Адізес)']];
  const rowColors: RowColor[] = [];
  let rowIdx = 1; // рядок 0 — заголовок
  for (const div of CANONICAL_DIVISIONS) {
    const role = DIVISION_PAEI[div.boardNo];
    const meta = PAEI_ROLES[role];
    orgRows.push([div.boardNo, div.name, '', div.ckp, role, meta.name]);
    rowColors.push({ startRow: rowIdx, endRow: rowIdx + 1, rgb: meta.color });
    rowIdx++;
    for (const dept of div.departments) {
      orgRows.push([div.boardNo, div.name, dept.name, dept.ckp, role, meta.name]);
      rowColors.push({ startRow: rowIdx, endRow: rowIdx + 1, rgb: meta.color });
      rowIdx++;
    }
  }
  await writeSheetValues(orgSheet, orgRows);
  await setRowBackground(orgSheet, rowColors, 6);
  await writeSheetValues(staffSheet, [['Працівник', 'Google пошта', 'Посади', 'Статус', 'Дата найму']]);
  await writeSheetValues(journalSheet, [['Дата', 'Дія', 'Обʼєкт', 'Деталі', 'Хто']]);

  // Дерево відділень / відділів / посад
  for (const div of CANONICAL_DIVISIONS) {
    const divLabel = `${div.boardNo}. ${div.name}`;
    const divFolder = await ensureFolder(company, divLabel);

    await buildPostUnit(divFolder, originalsRoot, {
      divisionLabel: divLabel,
      deptName: null,
      postName: `Голова відділення — ${div.name}`,
      ckp: div.ckp,
    });

    for (const dept of div.departments) {
      const deptFolder = await ensureFolder(divFolder, dept.name);
      await buildPostUnit(deptFolder, originalsRoot, {
        divisionLabel: divLabel,
        deptName: dept.name,
        postName: `Керівник відділу — ${dept.name}`,
        ckp: dept.ckp,
      });
    }
  }

  return {
    companyFolderId: company,
    url: driveFolderUrl(company),
    orgSheetId: orgSheet,
    staffSheetId: staffSheet,
    journalSheetId: journalSheet,
  };
}
