import 'dotenv/config';
import { prisma } from '@platform/db';
import { generateProcesses, processDocText } from '@platform/ai';
import { ensureFolder, ensureDoc } from '@platform/drive';

/**
 * Генерує бізнес-процеси для наявної компанії (заповнення сторінки процесів).
 * Запуск на сервері: yarn tsx scripts/gen-processes.ts <companyId> "<опис бізнесу>" "<болі через кому>"
 */
async function main() {
  const [companyId, business, painsStr] = process.argv.slice(2);
  if (!companyId || !business) throw new Error('yarn tsx scripts/gen-processes.ts <companyId> "<бізнес>" "<болі>"');

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, driveRootFolderId: true } });
  if (!company) throw new Error('Компанію не знайдено');

  const posts = await prisma.orgUnit.findMany({ where: { companyId, type: 'POST' }, select: { name: true } });
  const postTitles = [...new Set(posts.map((p) => p.name))].filter((n) => n !== 'Голова відділення' && n !== 'Керівник відділу');

  const answers = { business, pains: painsStr ? painsStr.split(',').map((s) => s.trim()) : [] };
  const procs = await generateProcesses(answers, postTitles, '');
  console.log(`Згенеровано процесів: ${procs.length}`);

  const procFolder = company.driveRootFolderId ? await ensureFolder(company.driveRootFolderId, 'Бізнес-процеси') : null;
  for (const pr of procs) {
    await prisma.process.create({ data: { companyId, name: pr.name, description: pr.description, steps: pr.steps as object } });
    if (procFolder) await ensureDoc(procFolder, pr.name, processDocText(pr.name, pr.description, pr.steps));
    console.log('  ✓', pr.name, `(${pr.steps.length} кроків)`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Помилка:', e?.message ?? e);
  process.exit(1);
});
