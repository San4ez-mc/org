import { prisma } from '@platform/db';
import { findFolderByName, isFileInFolder } from '@platform/drive';

/**
 * Область роботи асистента з Диском клієнта — єдине джерело правди для MCP і REST.
 *
 * Читання і запис розчеплені навмисно. Коли бот працює від імені клієнта (OAuth або
 * domain-wide delegation), Google уже не обмежує його нічим — технічно він може писати
 * будь-де на диску. Тому МЕЖУ ТРИМАЄ ЛИШЕ ЦЕЙ КОД, і тримає її серверно: у промпті
 * обмеження ставити не можна, бо промпт модель може проігнорувати.
 *
 * Усі значення беруться з полів компанії, не з констант — інакше кожен новий клієнт
 * вимагав би правки коду під свою структуру тек.
 */
export interface DriveScope {
  /** Що асистент читає й шукає. undefined = весь диск клієнта. */
  scanFolderId?: string;
  /** Куди асистенту дозволено писати. null = запис не налаштовано. */
  writeFolderId: string | null;
  /** Дозволені підтеки під текою запису (префікси назв). Порожньо = вся тека запису. */
  writableFolders: string[];
}

/**
 * Префікси тек для запису, які пропонуються НОВІЙ компанії за структурою орг-шаблону.
 * Це підказка для інтерфейсу, а не правило: перевірка завжди читає поля компанії.
 */
export const SUGGESTED_WRITABLE_FOLDERS = ['02_', '03_', '04_', '05_'];

export async function loadDriveScope(companyId: string): Promise<DriveScope> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { driveScanFolderId: true, driveWriteFolderId: true, driveWritableFolders: true },
  });
  if (!company) throw new Error('Компанію не знайдено');
  return {
    scanFolderId: company.driveScanFolderId ?? undefined,
    writeFolderId: company.driveWriteFolderId,
    writableFolders: company.driveWritableFolders ?? [],
  };
}

/**
 * Знайти теку, у яку дозволено писати. Кидає помилку з поясненням, яке бачить модель, —
 * щоб вона могла виправитись сама, а не впиралась у глухе «відмовлено».
 */
export async function resolveWriteTarget(scope: DriveScope, folder: string): Promise<string> {
  const root = scope.writeFolderId;
  if (!root) {
    throw new Error('Для цієї компанії не вказано теку для запису — запис вимкнено');
  }

  const name = String(folder ?? '').trim();
  const allowed = scope.writableFolders;

  if (!name) {
    if (allowed.length) {
      throw new Error(`Вкажи теку для запису. Дозволені: ${allowed.join(', ')}`);
    }
    return root; // запис дозволено в усю теку — пишемо в її корінь
  }

  if (allowed.length && !allowed.some((prefix) => name.startsWith(prefix))) {
    throw new Error(`Тека "${name}" не дозволена для запису. Дозволені: ${allowed.join(', ')}`);
  }

  const id = await findFolderByName(root, name);
  if (!id) throw new Error(`Теку "${name}" не знайдено в теці для запису`);
  return id;
}

/**
 * Перевірити файл, id якого прийшов ззовні. Без цього через fileId можна було б
 * записати в будь-який файл на диску, обійшовши перевірку теки.
 */
export async function assertFileWritable(folderId: string, fileId: string): Promise<void> {
  if (!(await isFileInFolder(fileId, folderId))) {
    throw new Error(`Файл ${fileId} не належить дозволеній теці — запис відхилено`);
  }
}
