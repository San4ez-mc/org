import { prisma } from '@platform/db';
import {
  CANONICAL_DIVISIONS,
  DEPARTMENT_RULES,
  CUSTOM_DEPARTMENT_MIN_POSTS,
  boardForPrompt,
  knownDepartments,
  type DepartmentOrigin,
} from '@platform/org-template';
import { flowsGenerate } from './vector';

/**
 * Куди в оргсхемі належить посада.
 *
 * Це рішення НЕ можна перекладати ні на клієнта, ні на асистента. Клієнт методології
 * не знає — він знає, що в нього є «ресерчер». Асистент знає рівно те, що написано
 * в описі інструмента, тобто один рядок: цього досить, щоб вгадати просте, і замало
 * для випадків, де помилка типова (найм для КЛІЄНТА — це виробництво, а не персонал).
 *
 * Тому класифікує платформа: у неї є повний каталог відділень і відділів із ЦКП,
 * і вона одна для всіх компаній. Покращуємо тут — розумнішають усі асистенти одразу.
 *
 * Відділення береться завжди: їх сім і вони незмінні. Відділ — не завжди: у малій
 * компанії посада нормально висить прямо на відділенні, і вигадувати їй коробочку
 * не треба.
 */

export interface DivisionGuess {
  boardNo: number;
  divisionName: string;
  departmentName: string | null;
  departmentCkp: string | null;
  departmentOrigin: DepartmentOrigin | null;
  confidence: 'high' | 'low';
  reason: string;
  /** Чому запропонований відділ не взяли — щоб було видно, а не мовчки зникло. */
  departmentRejected?: string;
}

const FALLBACK: DivisionGuess = {
  boardNo: 7,
  divisionName: 'Адміністративне відділення',
  departmentName: null,
  departmentCkp: null,
  departmentOrigin: null,
  confidence: 'low',
  reason: 'класифікатор недоступний — тимчасово в адміністративне',
};

/**
 * Однакові по суті назви пишуть по-різному: «Відділ продаж» і «відділ продажів».
 * Різницю в закінченні прощаємо, різницю в слові — ні: інакше «Склад» зʼїдав би
 * «Відділ складання», а це різні відділи.
 */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && long.length - short.length <= 3;
}

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
    'Віднеси посаду до відділення канонічної оргсхеми, і за потреби — до відділу.',
    '',
    `КОМПАНІЯ: ${company?.name ?? ''}`,
    company?.mission ? `Чим займається: ${company.mission}` : '',
    company?.companyCkp ? `ЦКП компанії: ${company.companyCkp}` : '',
    '',
    `ПОСАДА: ${postName}`,
    ckp ? `ЦКП посади: ${ckp}` : '',
    '',
    'СІМ ВІДДІЛЕНЬ І ВІДДІЛИ, ЯКІ СИСТЕМА ЗНАЄ:',
    boardForPrompt(),
    '',
    'ГОЛОВНЕ ПРАВИЛО ВІДДІЛЕННЯ: дивись, чиї це гроші.',
    'Якщо робота посади — це те, ЗА ЩО ПЛАТИТЬ КЛІЄНТ, вона у Технічному (4), навіть коли',
    'зовні схожа на іншу функцію. Класична пастка: у кадровій агенції рекрутер шукає людей',
    'для замовника — це виробництво (4), а не персонал (1). У Відділенні побудови (1) сидять',
    'ті, хто наймає у ВЛАСНУ команду.',
    '',
    'ВІДДІЛ. Спершу шукай серед відділів цього відділення вище — бери готовий, якщо підходить',
    'по ЦКП і виконується умова в дужках. Якщо жоден не підходить, а функція справді окрема,',
    'можеш запропонувати новий. Правила створення нового відділу:',
    ...DEPARTMENT_RULES.map((r, i) => `${i + 1}. ${r}`),
    'Якщо посаді не потрібен окремий відділ — поверни department: null. Це нормальна відповідь,',
    'а не поразка: у компанії з трьох людей відділів не буває.',
    '',
    'Поверни РІВНО один JSON без тексту навколо:',
    '{"boardNo":4,',
    ' "department":{"name":"назва","ckp":"ЦКП відділу","isNew":false} або null,',
    ' "confidence":"high|low","reason":"одне речення"}',
    'confidence=low, якщо посада могла б належати двом відділенням.',
  ].filter(Boolean).join('\n');

  const text = await flowsGenerate(prompt, 700);
  if (!text) return FALLBACK;

  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return FALLBACK;

  let parsed: any;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return FALLBACK;
  }

  const boardNo = Number(parsed.boardNo);
  const div = CANONICAL_DIVISIONS.find((d) => d.boardNo === boardNo);
  if (!div) return FALLBACK;

  const base: DivisionGuess = {
    boardNo,
    divisionName: div.name,
    departmentName: null,
    departmentCkp: null,
    departmentOrigin: null,
    confidence: parsed.confidence === 'high' ? 'high' : 'low',
    reason: String(parsed.reason ?? '').slice(0, 200),
  };

  const dept = parsed.department;
  const deptName = String(dept?.name ?? '').trim();
  if (!dept || !deptName) return base;

  // Відомий відділ — беремо як є, разом з його канонічним ЦКП.
  const known = knownDepartments(boardNo).find((k) => sameName(k.name, deptName));
  if (known) {
    return { ...base, departmentName: known.name, departmentCkp: known.ckp, departmentOrigin: known.origin };
  }

  // Новий відділ. Перевіряємо те, що взагалі можна перевірити машинно: решта
  // правил лишається на совісті моделі, але ці три ловлять типові зриви.
  const deptCkp = String(dept?.ckp ?? '').trim();
  if (!deptCkp) {
    return { ...base, departmentRejected: `«${deptName}» без ЦКП — відділ без результату не заводимо` };
  }
  // ЦКП, що дослівно повторює наявний, означає той самий відділ під новою назвою.
  const twin = knownDepartments(boardNo).find((k) => sameName(k.ckp, deptCkp));
  if (twin) {
    return { ...base, departmentName: twin.name, departmentCkp: twin.ckp, departmentOrigin: twin.origin };
  }
  // Відділ навколо однієї людини — це посада. Чекаємо, поки функція набере вагу.
  const postsInDivision = await prisma.orgUnit.count({
    where: { companyId, type: 'POST', parent: { OR: [{ boardNo, type: 'DIVISION' }, { parent: { boardNo, type: 'DIVISION' } }] } },
  });
  if (postsInDivision < CUSTOM_DEPARTMENT_MIN_POSTS) {
    return {
      ...base,
      departmentRejected:
        `«${deptName}» поки не заводимо: у відділенні ${postsInDivision} посад(и). `
        + `Новий відділ має сенс від ${CUSTOM_DEPARTMENT_MIN_POSTS} — інакше це посада, а не відділ.`,
    };
  }

  return { ...base, departmentName: deptName, departmentCkp: deptCkp, departmentOrigin: 'CUSTOM' };
}
