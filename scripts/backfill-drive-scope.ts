import 'dotenv/config';
import { prisma } from '@platform/db';
import { SUGGESTED_WRITABLE_FOLDERS } from '../apps/api/src/services/driveScope';

/**
 * Разовий бекфіл після розчеплення областей асистента (читання / запис).
 *
 * До зміни обидві області бралися з `driveRootFolderId`. Щоб наявні компанії
 * поводились рівно як раніше, переносимо це значення в обидва нові поля.
 * Нові компанії налаштовуються в інтерфейсі і дефолтів не успадковують.
 *
 * Ідемпотентний: чіпає лише компанії, де нові поля ще порожні.
 *
 * Запуск: yarn tsx scripts/backfill-drive-scope.ts
 */
async function main() {
  const companies = await prisma.company.findMany({
    where: {
      driveRootFolderId: { not: null },
      driveScanFolderId: null,
      driveWriteFolderId: null,
    },
    select: { id: true, name: true, driveRootFolderId: true, driveWritableFolders: true },
  });

  if (!companies.length) {
    console.log('Нічого переносити — усі компанії вже налаштовані.');
    return;
  }

  for (const c of companies) {
    await prisma.company.update({
      where: { id: c.id },
      data: {
        driveScanFolderId: c.driveRootFolderId,
        driveWriteFolderId: c.driveRootFolderId,
        ...(c.driveWritableFolders?.length ? {} : { driveWritableFolders: SUGGESTED_WRITABLE_FOLDERS }),
      },
    });
    console.log(`✅ ${c.name} — області асистента = ${c.driveRootFolderId}`);
  }

  console.log(`\nГотово. Оновлено компаній: ${companies.length}`);
}

main()
  .catch((err) => {
    console.error('Помилка бекфілу:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
