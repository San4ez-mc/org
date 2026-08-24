import 'dotenv/config';
import {
  authMode,
  ensureFolder,
  ensureSpreadsheet,
  appendSheetValues,
  searchFiles,
  readFileById,
  readSheetRows,
  updateSheetRow,
  writeFile,
  isFileInFolder,
  driveFolderUrl,
} from '@platform/drive';

/**
 * Прогін інструментів асистента Digital Hiring по реальному Drive.
 * Створює одноразову теку "__DH smoke" під DRIVE_ROOT_FOLDER_ID — її можна видаляти.
 * Запуск: yarn tsx scripts/dh-drive-smoke.ts
 */

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

async function main() {
  const root = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error('DRIVE_ROOT_FOLDER_ID не задано в .env');
  console.log('Режим авторизації:', authMode());

  const stamp = Date.now().toString(36);
  const smokeRoot = await ensureFolder(root, '__DH smoke');
  console.log('Тека прогону:', driveFolderUrl(smokeRoot), '\n');

  const kb = await ensureFolder(smokeRoot, '01_База_знань');
  const generated = await ensureFolder(smokeRoot, '04_Згенеровано');

  // ── writeFile: створення ───────────────────────────────────────────────────
  console.log('writeFile / readFileById:');
  const marker = `DHMARKER${stamp}`;
  const name = `Довідка ${stamp}`;
  const created = await writeFile(generated, name, `Перша версія. Маркер: ${marker}`);
  check('створює документ', created.created === true, created.fileId);

  const readBack = await readFileById(created.fileId);
  check('читає створений текст', (readBack.text ?? '').includes(marker));

  // ── writeFile: оновлення наявного за назвою ────────────────────────────────
  const updated = await writeFile(generated, name, `Друга версія. Маркер: ${marker}`);
  check('оновлює наявний, не плодить дублі', updated.created === false && updated.fileId === created.fileId);

  const readBack2 = await readFileById(created.fileId);
  const t2 = readBack2.text ?? '';
  check('вміст замінено цілком', t2.includes('Друга версія') && !t2.includes('Перша версія'), t2.slice(0, 60));

  // ── isFileInFolder ─────────────────────────────────────────────────────────
  console.log('\nisFileInFolder (основа whitelist):');
  check('впізнає свою теку', await isFileInFolder(created.fileId, generated));
  check('відхиляє чужу теку', !(await isFileInFolder(created.fileId, kb)));

  // ── searchFiles ────────────────────────────────────────────────────────────
  console.log('\nsearchFiles:');
  const byName = await searchFiles(name, smokeRoot);
  check('знаходить за назвою в scope', byName.some((f) => f.id === created.fileId), `знайдено ${byName.length}`);
  check('повертає посилання', byName.every((f) => !!f.webViewLink));

  const outOfScope = await searchFiles(name, kb);
  check('поважає scope теки', !outOfScope.some((f) => f.id === created.fileId), `знайдено ${outOfScope.length}`);

  // ── Sheets ─────────────────────────────────────────────────────────────────
  console.log('\nSheets (CRM):');
  const sheetId = await ensureSpreadsheet(smokeRoot, `CRM ${stamp}`);
  await appendSheetValues(sheetId, [
    ['name', 'telegram', 'role', 'company', 'last_agreement', 'deadline', 'notes'],
    ['Іван Петренко', '@ivan', 'client', 'Acme Ltd', 'Форма до пʼятниці', '2026-08-22', ''],
    ['Олена Коваль', '@olena', 'candidate', 'Beta Inc', 'Надіслати CV', '2026-08-25', ''],
  ]);

  const sheet = await readSheetRows(sheetId);
  check('читає заголовок', sheet.header[0] === 'name', sheet.header.join(','));
  check('читає рядки', sheet.rows.length === 2, `${sheet.rows.length} рядків`);
  check('нумерація рядків з 2', sheet.rows[0]?.rowNumber === 2);

  await updateSheetRow(sheetId, 2, ['Іван Петренко', '@ivan', 'client', 'Acme Ltd', 'ОНОВЛЕНО', '2026-08-30', 'ok']);
  const after = await readSheetRows(sheetId);
  check('оновлює саме той рядок', after.rows[0]?.values[4] === 'ОНОВЛЕНО');
  check('не чіпає сусідній рядок', after.rows[1]?.values[0] === 'Олена Коваль');
  check('кількість рядків не змінилась', after.rows.length === 2, `${after.rows.length}`);

  let rejected = false;
  try {
    await updateSheetRow(sheetId, 1, ['спроба переписати заголовок']);
  } catch {
    rejected = true;
  }
  check('відхиляє запис у рядок заголовків', rejected);

  console.log(`\n${failed === 0 ? '✅ Усе пройдено' : `❌ Провалено перевірок: ${failed}`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Помилка прогону:', err?.message ?? err);
  process.exit(1);
});
