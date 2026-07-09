import 'dotenv/config';
import { getFileMeta, ensureFolder, driveFolderUrl } from '@platform/drive';

/**
 * Швидка перевірка доступу сервіс-акаунта до кореневої папки Drive.
 * Запуск: yarn tsx scripts/drive-smoke.ts
 */
async function main() {
  const root = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error('DRIVE_ROOT_FOLDER_ID не задано в .env');

  console.log('Перевіряю доступ до кореневої папки:', root);
  const meta = await getFileMeta(root);
  console.log('  OK →', meta.name, `(${meta.mimeType})`, meta.driveId ? `[Shared Drive ${meta.driveId}]` : '[My Drive]');

  const testId = await ensureFolder(root, '__ping доступу платформи');
  console.log('  Створено/знайдено тестову теку:', driveFolderUrl(testId));
  console.log('Доступ підтверджено ✅');
}

main().catch((err) => {
  console.error('Помилка доступу:', err?.message ?? err);
  process.exit(1);
});
