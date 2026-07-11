import { callClaude, callClaudeJson } from './claude';

export interface OnboardingAnswers {
  business?: string;
  product?: string;
  teamSize?: string | number;
  functions?: string[];
  roles?: string[];
  pains?: string[];
  [k: string]: unknown;
}

const SYSTEM = `Ти — консультант з орг.структури, що працює за адмінтехнологією Хаббарда (7 відділень: 1 Побудови, 2 Поширення, 3 Фінансове, 4 Технічне, 5 Кваліфікації, 6 По роботі з публікою, 7 Адміністративне) з накладанням ролей Адізеса (PAEI). Пишеш українською, на «ти», коротко і по-справі.`;

/**
 * Генерує тейлоровані під конкретний бізнес рекомендації (Markdown-текст),
 * які лягають окремим документом у папку компанії і згадуються у відповіді бота.
 */
export async function companyStarterNotes(answers: OnboardingAnswers, knowledgeContext = ''): Promise<string> {
  const kb = knowledgeContext
    ? `\nМЕТОДОЛОГІЧНИЙ КОНТЕКСT (спирайся на нього, коли пояснюєш ЧОМУ так):\n${knowledgeContext}\n`
    : '';
  const prompt = `Ось дані про бізнес (з опитування):
${JSON.stringify(answers, null, 2)}
${kb}
Створи стислий стартовий документ «Рекомендації під твій бізнес» у Markdown. Розділи:
1. Які посади реально потрібні цьому бізнесу (по відділеннях 1–7), з коротким ЦКП кожної. Не вигадуй зайвих — лише те, що випливає з бізнесу.
2. 2–4 ключових бізнес-процеси (потоки цінності) — назва + кроки через посади.
3. Баланс PAEI: чого бракує (P/A/E/I) і на що звернути увагу.
Пиши конкретно під цей бізнес, без загальних фраз. Без вступів і висновків — одразу по суті.`;
  return callClaude(prompt, { system: SYSTEM, maxTokens: 2000, temperature: 0.5 });
}

export interface MappedPost {
  boardNo: number; // 1..7 — відділення
  title: string;
  ckp: string;
  paei?: 'P' | 'A' | 'E' | 'I';
  holderName?: string;
}

export interface MappedStructure {
  companyName: string;
  posts: MappedPost[];
}

const DIVISIONS_HINT =
  '1 Побудови (персонал/найм/HR), 2 Поширення (маркетинг+продажі), 3 Фінансове (дохід/розхід/облік), 4 Технічне (виробництво продукту чи послуги), 5 Кваліфікації (якість/навчання), 6 По роботі з публікою (PR/партнери), 7 Адміністративне (керівництво/стратегія)';

/** Розкладає реальні посади бізнесу на 7 відділень (мапінг на канонічний борд). */
export async function mapBusinessToStructure(answers: OnboardingAnswers, knowledgeContext = ''): Promise<MappedStructure> {
  const kb = knowledgeContext ? `\nМЕТОДОЛОГІЯ (спирайся на неї при мапінгу):\n${knowledgeContext}\n` : '';
  const prompt = `Дані про бізнес:
${JSON.stringify(answers, null, 2)}
${kb}
Признач КОЖНУ реальну посаду цього бізнесу на одне з 7 відділень за boardNo: ${DIVISIONS_HINT}.
Поверни ТІЛЬКИ JSON без тексту навколо:
{ "companyName": "коротка назва", "posts": [ { "boardNo": 2, "title": "Таргетолог", "ckp": "короткий ЦКП", "paei": "P", "holderName": "" } ] }
Правила: конкретні посади саме цього бізнесу (Таргетолог, Копірайтер, Проджект-менеджер...), не загальні відділи. ЦКП — стисло. paei — одна з P/A/E/I. holderName з ролей, якщо відоме, інакше "". Якщо на посаді кілька людей — один запис на посаду.`;
  return callClaudeJson<MappedStructure>(prompt, { system: SYSTEM, maxTokens: 1500, temperature: 0.3 });
}

export interface ProcessStep {
  postTitle: string; // яка посада виконує крок
  action: string; // що робить
  result: string; // результат кроку (передається далі)
}

export interface GeneratedProcess {
  name: string;
  description: string;
  steps: ProcessStep[];
  mermaid?: string; // swimlane-діаграма (лейни = відповідальні)
}

/**
 * Генерує ключові бізнес-процеси (потоки цінності) з кроками по реальних посадах.
 * Частинка (лід/замовлення/учень/документ) тече зліва-направо через посади.
 */
export async function generateProcesses(
  answers: OnboardingAnswers,
  postTitles: string[],
  knowledgeContext = '',
): Promise<GeneratedProcess[]> {
  const kb = knowledgeContext ? `\nМЕТОДОЛОГІЯ:\n${knowledgeContext}\n` : '';
  const prompt = `Бізнес:
${JSON.stringify(answers, null, 2)}

Посади компанії: ${postTitles.join(', ')}
${kb}
Побудуй 2–4 КЛЮЧОВІ бізнес-процеси (потоки цінності) цього бізнесу — насамперед ті, що закривають болі. Кожен процес = послідовність кроків, де частинка (лід/замовлення/клієнт/документ) проходить через посади зліва-направо.
Поверни ТІЛЬКИ JSON без тексту навколо:
{ "processes": [ { "name": "Онбординг нового учня", "description": "стисло навіщо", "steps": [ { "postTitle": "Менеджер з продажу", "action": "що робить", "result": "що передає далі" } ] } ] }
Правила: postTitle — тільки з наведених посад. 4–8 кроків. Дії конкретні, дієслівні.`;
  const out = await callClaudeJson<{ processes: GeneratedProcess[] }>(prompt, {
    system: SYSTEM,
    maxTokens: 2500,
    temperature: 0.4,
  });
  return out.processes ?? [];
}

/**
 * Генерує Mermaid swimlane для процесу окремим викликом — ПРОСТИМ ТЕКСТОМ (не JSON),
 * щоб переноси/лапки в діаграмі не ламали парсинг. З лейнами по відповідальних і рішеннями.
 */
export async function generateProcessMermaid(process: GeneratedProcess, postTitles: string[]): Promise<string> {
  const prompt = `Побудуй Mermaid swimlane-діаграму для бізнес-процесу.
Процес: ${process.name}
Опис: ${process.description}
Кроки: ${process.steps.map((s, i) => `${i + 1}) [${s.postTitle}] ${s.action} → ${s.result}`).join('; ')}
Доступні відповідальні (лейни): ${[...new Set([...postTitles, 'Клієнт', 'Система'])].join(', ')}

Правила синтаксису (дотримуйся ТОЧНО):
- Починай з "flowchart TD".
- На кожного відповідального — subgraph: subgraph L1["Назва відповідального"] ... end
- Вузли-дії: a1["текст"]; рішення: d1{"Питання?"}; id вузлів латиницею.
- Тексти в подвійних лапках, без переносів рядків і без лапок всередині.
- Звʼязки: a1 --> a2; гілки: d1 -->|так| a3 та d1 -->|ні| a4.

Виведи ЛИШЕ код діаграми, без пояснень і без блоку \`\`\`.`;
  const raw = await callClaude(prompt, { system: SYSTEM, maxTokens: 1500, temperature: 0.3 });
  const cleaned = raw.replace(/```mermaid/gi, '').replace(/```/g, '').trim();
  return cleaned.startsWith('flowchart') || cleaned.startsWith('graph') ? cleaned : '';
}

/** Пропонує коротку назву компанії з опису бізнесу (для назви папки). */
export async function suggestCompanyName(answers: OnboardingAnswers): Promise<string> {
  if (typeof answers.business === 'string' && answers.business.length <= 40) return answers.business;
  const prompt = `З цього опису бізнесу дай коротку назву компанії (2–4 слова, без лапок, тільки назву):\n${answers.business ?? JSON.stringify(answers)}`;
  const name = (await callClaude(prompt, { system: SYSTEM, maxTokens: 30, temperature: 0.2 })).split('\n')[0].trim();
  return name.replace(/["'.]/g, '').slice(0, 60) || 'Нова компанія';
}
