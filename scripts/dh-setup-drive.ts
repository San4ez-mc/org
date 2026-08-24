import 'dotenv/config';

/**
 * Розгортання структури тек асистента Digital Hiring (ТЗ §5) під заданим коренем.
 * Ідемпотентно: повторний запуск нічого не дублює.
 *
 * Теки сервіс-акаунт створює без проблем. А ось Google-таблицю CRM він створити НЕ може
 * (у SA нема квоти сховища) — її треба або створити під OAuth, або віддати готову й розшарити.
 *
 * Запуск:  yarn tsx scripts/dh-setup-drive.ts [parentFolderId]
 */

const FOLDERS = [
  '01_База_знань',
  '02_Клієнти',
  '03_Кандидати',
  '04_Згенеровано',
  '05_Звіти',
];

async function main() {
  const d = await import('@platform/drive');
  const parent = process.argv[2] || process.env.DRIVE_ROOT_FOLDER_ID;
  if (!parent) throw new Error('Вкажи parentFolderId аргументом або DRIVE_ROOT_FOLDER_ID у .env');

  console.log('Режим авторизації:', d.authMode());
  const rootId = await d.ensureFolder(parent, 'AI-Асистент (Digital Hiring)');
  console.log('Корінь проєкту:', rootId);
  console.log('  ', d.driveFolderUrl(rootId));

  for (const name of FOLDERS) {
    const id = await d.ensureFolder(rootId, name);
    console.log(`  ✅ ${name} → ${id}`);
  }

  console.log('\nDRIVE_ROOT_ID для ключів воронки:', rootId);

  // Таблиця CRM — окремо, бо саме тут SA впирається у квоту.
  try {
    const sheetId = await d.ensureSpreadsheet(rootId, 'CRM — People');
    const { getSheets } = d as any;
    const sheets = getSheets();
    const cur = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'A1:G1' });
    if (!(cur.data.values ?? []).length) {
      await d.writeSheetValues(
        sheetId,
        [['name', 'telegram', 'role', 'company', 'last_agreement', 'deadline', 'notes']],
        'A1',
      );
    }
    console.log('CRM_SHEET_ID для ключів воронки:', sheetId);
  } catch (e: any) {
    console.log('\n⚠️  CRM-таблицю створити не вдалося:', String(e?.message).slice(0, 120));
    console.log('    Причина очікувана, якщо режим авторизації service_account.');
    console.log('    Варіанти: (а) переавторизувати OAuth — yarn auth:google;');
    console.log('              (б) створити таблицю вручну і розшарити на акаунт платформи,');
    console.log('                  тоді запис у ГОТОВУ таблицю працює і під SA.');
  }
}

main().catch((err) => {
  console.error('Помилка:', err?.message ?? err);
  process.exit(1);
});
