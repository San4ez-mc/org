import 'dotenv/config';
import { prisma } from '@platform/db';
import { CANONICAL_DIVISIONS } from '@platform/org-template';

/**
 * Додає канонічні відділи (з ЦКП) до відділень компаній, де їх ще немає.
 * Запуск на сервері: yarn tsx scripts/backfill-departments.ts
 */
async function main() {
  const divisions = await prisma.orgUnit.findMany({ where: { type: 'DIVISION' } });
  let added = 0;
  for (const div of divisions) {
    const canon = CANONICAL_DIVISIONS.find((d) => d.boardNo === div.boardNo);
    if (!canon) continue;
    const existing = await prisma.orgUnit.count({ where: { parentId: div.id, type: 'DEPARTMENT' } });
    if (existing > 0) continue;
    for (const dept of canon.departments) {
      await prisma.orgUnit.create({
        data: { companyId: div.companyId, parentId: div.id, type: 'DEPARTMENT', name: dept.name, boardNo: dept.boardNo, ckp: dept.ckp },
      });
      added++;
    }
  }
  console.log(`Готово ✅ Додано відділів: ${added}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Помилка:', e?.message ?? e);
  process.exit(1);
});
