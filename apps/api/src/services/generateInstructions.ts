import { prisma } from '@platform/db';
import { writeFile, ensureInstructionOriginal } from '@platform/drive';
import { instructionSpecForPrompt } from '@platform/org-template';
import { flowsGenerate } from './vector';
import { withCompanyDrive } from './driveScope';

/**
 * Наповнення посадових інструкцій змістом.
 *
 * Досі публікація створювала лише каркас із заголовками — документ, який нікому
 * не потрібен. Текст будуємо з того, що вже є в системі: ЦКП посади, її кроки в
 * описаних бізнес-процесах, підпорядкування. Нічого не вигадуємо понад це:
 * інструкція, у якій половина вигадана, гірша за порожню, бо їй вірять.
 */

export interface GenerateResult {
  generated: { post: string; url: string; chars: number }[];
  skipped: { post: string; reason: string }[];
}

interface Step {
  postTitle?: string;
  post?: string;
  action?: string;
  result?: string;
}

/** Чи цей крок належить посаді. Назви в кроках і в структурі рідко збігаються дослівно. */
function isSamePost(stepWho: string, postName: string): boolean {
  const a = stepWho.trim().toLowerCase();
  const b = postName.trim().toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/** Кроки процесів, де фігурує ця посада — з них виростає розділ «Що робить». */
function stepsForPost(
  postName: string,
  processes: { name: string; description: string | null; steps: unknown }[],
): string {
  const out: string[] = [];
  for (const proc of processes) {
    const steps = Array.isArray(proc.steps) ? (proc.steps as Step[]) : [];
    const mine = steps
      .map((s, i) => ({ s, no: i + 1 }))
      .filter(({ s }) => isSamePost(String(s.postTitle ?? s.post ?? ''), postName));
    if (!mine.length) continue;

    out.push(`Процес «${proc.name}»${proc.description ? ` — ${proc.description}` : ''}:`);
    for (const { s, no } of mine) out.push(`  крок ${no}. ${s.action ?? ''} → ${s.result ?? ''}`);
  }
  return out.join('\n') || '(у описаних процесах ця посада поки не фігурує)';
}

/** Відділення посади: піднімаємось до DIVISION, інакше адміністративне. */
function divisionOf(parent: { name: string; type: string; boardNo: number | null } | null): {
  boardNo: number;
  deptName: string | null;
} {
  if (!parent) return { boardNo: 7, deptName: null };
  if (parent.type === 'DIVISION') return { boardNo: parent.boardNo ?? 7, deptName: null };
  return { boardNo: 7, deptName: parent.type === 'DEPARTMENT' ? parent.name : null };
}

export async function generateInstructions(companyId: string): Promise<GenerateResult> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, mission: true, companyCkp: true, driveRegulationsFolderId: true },
  });
  if (!company) throw new Error('Компанію не знайдено');
  if (!company.driveRegulationsFolderId) throw new Error('no-regulations-folder');

  const posts = await prisma.orgUnit.findMany({
    where: { companyId, type: 'POST' },
    select: {
      name: true,
      ckp: true,
      holderName: true,
      parent: { select: { name: true, type: true, boardNo: true } },
    },
  });
  const processes = await prisma.process.findMany({
    where: { companyId },
    select: { name: true, description: true, steps: true },
  });

  const allPosts = posts.map((p) => p.name).join(', ');
  const generated: GenerateResult['generated'] = [];
  const skipped: GenerateResult['skipped'] = [];

  await withCompanyDrive(companyId, async () => {
    for (const post of posts) {
      const prompt = [
        `Напиши посадову інструкцію для посади «${post.name}» у компанії «${company.name}».`,
        company.mission ? `Чим займається компанія: ${company.mission}` : '',
        company.companyCkp ? `ЦКП компанії: ${company.companyCkp}` : '',
        post.ckp ? `ЦКП посади (основа першого розділу): ${post.ckp}` : '',
        post.parent?.name ? `Підрозділ: ${post.parent.name}` : '',
        post.holderName ? `Зараз обіймає: ${post.holderName}` : 'Посада вакантна.',
        `Інші посади в компанії: ${allPosts}`,
        '',
        'КРОКИ ЦІЄЇ ПОСАДИ В ОПИСАНИХ ПРОЦЕСАХ:',
        stepsForPost(post.name, processes),
        '',
        'СТРУКТУРА ДОКУМЕНТА — рівно ці розділи, у цьому порядку, кожен з «## » на початку:',
        instructionSpecForPrompt(),
        '',
        'ПРАВИЛА:',
        '- Спирайся ТІЛЬКИ на дані вище. Не вигадуй кроків, людей, цифр і сервісів, яких немає.',
        '- Де даних бракує — напиши «Потребує уточнення» і одним рядком, що саме спитати.',
        '  Це чесніше за правдоподібну вигадку: інструкціям вірять, і вигадка стане правилом.',
        '- Мова проста й дієслівна, без канцеляриту.',
        '- Ніяких вступів і висновків від себе. Тільки документ.',
        'Українською.',
      ].filter(Boolean).join('\n');

      const text = await flowsGenerate(prompt, 3000);
      if (!text || text.trim().length < 200) {
        skipped.push({ post: post.name, reason: 'генератор не повернув тексту' });
        continue;
      }

      // Пишемо в ТОЙ САМИЙ документ, що створила публікація, а не поруч:
      // ensureInstructionOriginal ідемпотентний і віддає id наявного оригіналу.
      const { boardNo, deptName } = divisionOf(post.parent);
      const docId = await ensureInstructionOriginal(
        company.driveRegulationsFolderId!,
        boardNo,
        deptName,
        post.name,
        post.ckp || '',
      );

      const clean = text.replace(/```(?:markdown)?/gi, '').trim();
      const r = await writeFile('', `${post.name} — Інструкція`, clean, docId);
      generated.push({ post: post.name, url: r.webViewLink, chars: clean.length });
    }
  });

  return { generated, skipped };
}
