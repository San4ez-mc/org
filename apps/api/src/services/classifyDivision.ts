import { prisma } from '@platform/db';
import { CANONICAL_DIVISIONS } from '@platform/org-template';
import { flowsGenerate } from './vector';

/**
 * До якого з семи відділень належить посада.
 *
 * Це рішення НЕ можна перекладати ні на клієнта, ні на асистента. Клієнт методології
 * не знає — він знає, що в нього є «ресерчер». Асистент знає рівно те, що написано
 * в описі інструмента, тобто один рядок: цього досить, щоб вгадати просте, і замало
 * для випадків, де помилка типова (найм для КЛІЄНТА — це виробництво, а не персонал).
 *
 * Тому класифікує платформа: у неї є повний канон із ЦКП кожного відділення й відділу,
 * і вона одна для всіх компаній. Покращуємо тут — розумнішають усі асистенти одразу.
 */

export interface DivisionGuess {
  boardNo: number;
  divisionName: string;
  departmentName: string | null;
  confidence: 'high' | 'low';
  reason: string;
}

/** Канон у вигляді, придатному для промпту: відділення, їх ЦКП і відділи. */
function canonForPrompt(): string {
  return [...CANONICAL_DIVISIONS]
    .sort((a, b) => a.boardNo - b.boardNo)
    .map((d) => {
      const depts = d.departments.map((x) => `      · ${x.name} — ${x.ckp}`).join('\n');
      return `${d.boardNo}. ${d.name}\n   ЦКП відділення: ${d.ckp}\n   Відділи:\n${depts}`;
    })
    .join('\n\n');
}

const FALLBACK: DivisionGuess = {
  boardNo: 7,
  divisionName: 'Адміністративне відділення',
  departmentName: null,
  confidence: 'low',
  reason: 'класифікатор недоступний — тимчасово в адміністративне',
};

export async function classifyPostDivision(
  companyId: string,
  postName: string,
  ckp?: string | null,
): Promise<DivisionGuess> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, mission: true, companyCkp: true },
  });

  const prompt = [
    `Віднеси посаду до одного з семи відділень канонічної орг-схеми.`,
    '',
    `КОМПАНІЯ: ${company?.name ?? ''}`,
    company?.mission ? `Чим займається: ${company.mission}` : '',
    company?.companyCkp ? `ЦКП компанії: ${company.companyCkp}` : '',
    '',
    `ПОСАДА: ${postName}`,
    ckp ? `ЦКП посади: ${ckp}` : '',
    '',
    'СІМ ВІДДІЛЕНЬ:',
    canonForPrompt(),
    '',
    'ГОЛОВНЕ ПРАВИЛО: дивись, чиї це гроші.',
    'Якщо робота посади — це те, ЗА ЩО ПЛАТИТЬ КЛІЄНТ, вона у Технічному (4), навіть коли',
    'зовні схожа на іншу функцію. Класична пастка: у кадровій агенції рекрутер шукає людей',
    'для замовника — це виробництво (4), а не персонал (1). У Відділенні побудови (1) сидять',
    'ті, хто наймає у ВЛАСНУ команду.',
    '',
    'Відділ обирай лише якщо він справді підходить; інакше null.',
    '',
    'Поверни РІВНО один JSON без тексту навколо:',
    '{"boardNo":4,"departmentName":"Відділ виробництва або null","confidence":"high|low","reason":"одне речення"}',
    'confidence=low, якщо посада могла б належати двом відділенням.',
  ].filter(Boolean).join('\n');

  const text = await flowsGenerate(prompt, 500);
  if (!text) return FALLBACK;

  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return FALLBACK;

  try {
    const p = JSON.parse(m[0]);
    const boardNo = Number(p.boardNo);
    const div = CANONICAL_DIVISIONS.find((d) => d.boardNo === boardNo);
    if (!div) return FALLBACK;

    const dept = String(p.departmentName ?? '').trim();
    const known = div.departments.find((d) => d.name.toLowerCase() === dept.toLowerCase());

    return {
      boardNo,
      divisionName: div.name,
      // Відділ приймаємо лише канонічний: інакше модель вигадає свій, і в структурі
      // зʼявиться відділ, якого немає в методології.
      departmentName: known?.name ?? null,
      confidence: p.confidence === 'high' ? 'high' : 'low',
      reason: String(p.reason ?? '').slice(0, 200),
    };
  } catch {
    return FALLBACK;
  }
}
