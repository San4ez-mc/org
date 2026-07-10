import 'dotenv/config';
import { prisma } from '@platform/db';

/**
 * Наводить лад у наявних компаніях:
 *  1) тримач = null там, де holderName == назва посади (фейковий тримач);
 *  2) додає «Голова відділення» / «Керівник відділу» де їх ще немає.
 * Запуск на сервері: yarn tsx scripts/fix-company-units.ts
 */
async function main() {
  // 1) чистимо фейкових тримачів
  const cleaned = await prisma.$executeRawUnsafe(
    `UPDATE "OrgUnit" SET "holderName" = NULL, "isVacant" = true WHERE type='POST' AND "holderName" IS NOT NULL AND trim("holderName") = trim(name)`,
  );
  console.log('Очищено фейкових тримачів:', cleaned);

  // 2) голови відділень
  const divisions = await prisma.orgUnit.findMany({ where: { type: 'DIVISION' }, select: { id: true, companyId: true, ckp: true } });
  let heads = 0;
  for (const d of divisions) {
    const has = await prisma.orgUnit.count({ where: { parentId: d.id, type: 'POST', name: 'Голова відділення' } });
    if (!has) {
      await prisma.orgUnit.create({ data: { companyId: d.companyId, parentId: d.id, type: 'POST', name: 'Голова відділення', ckp: d.ckp, isVacant: true } });
      heads++;
    }
  }
  // 3) керівники відділів
  const depts = await prisma.orgUnit.findMany({ where: { type: 'DEPARTMENT' }, select: { id: true, companyId: true, ckp: true } });
  let deptHeads = 0;
  for (const dep of depts) {
    const has = await prisma.orgUnit.count({ where: { parentId: dep.id, type: 'POST', name: 'Керівник відділу' } });
    if (!has) {
      await prisma.orgUnit.create({ data: { companyId: dep.companyId, parentId: dep.id, type: 'POST', name: 'Керівник відділу', ckp: dep.ckp, isVacant: true } });
      deptHeads++;
    }
  }
  console.log(`Додано голів відділень: ${heads}, керівників відділів: ${deptHeads}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Помилка:', e?.message ?? e);
  process.exit(1);
});
