import 'dotenv/config';
import { buildCompanyStructure } from '@platform/drive';

/**
 * Створює під кореневою папкою повну структуру компанії (уточнена модель:
 * оригінали інструкцій у Побудові + ярлики в папках посад, Робочі папки, Архів, дашборд).
 *
 * Запуск: yarn create:company "Назва компанії"
 * Ідемпотентно: повторний запуск не дублює.
 */
async function main() {
  const companyName = process.argv[2];
  if (!companyName) throw new Error('Вкажи назву компанії: yarn create:company "Назва"');
  const root = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error('DRIVE_ROOT_FOLDER_ID не задано в .env');

  console.log(`Створюю структуру компанії «${companyName}» під ${root} …`);
  const res = await buildCompanyStructure(root, companyName);
  console.log('\nГотово ✅');
  console.log('Папка компанії:', res.url);
}

main().catch((err) => {
  console.error('Помилка:', err?.message ?? err);
  process.exit(1);
});
