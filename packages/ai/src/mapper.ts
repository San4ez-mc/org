import { callClaude } from './claude';

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
export async function companyStarterNotes(answers: OnboardingAnswers): Promise<string> {
  const prompt = `Ось дані про бізнес (з опитування):
${JSON.stringify(answers, null, 2)}

Створи стислий стартовий документ «Рекомендації під твій бізнес» у Markdown. Розділи:
1. Які посади реально потрібні цьому бізнесу (по відділеннях 1–7), з коротким ЦКП кожної. Не вигадуй зайвих — лише те, що випливає з бізнесу.
2. 2–4 ключових бізнес-процеси (потоки цінності) — назва + кроки через посади.
3. Баланс PAEI: чого бракує (P/A/E/I) і на що звернути увагу.
Пиши конкретно під цей бізнес, без загальних фраз. Без вступів і висновків — одразу по суті.`;
  return callClaude(prompt, { system: SYSTEM, maxTokens: 2000, temperature: 0.5 });
}

/** Пропонує коротку назву компанії з опису бізнесу (для назви папки). */
export async function suggestCompanyName(answers: OnboardingAnswers): Promise<string> {
  if (typeof answers.business === 'string' && answers.business.length <= 40) return answers.business;
  const prompt = `З цього опису бізнесу дай коротку назву компанії (2–4 слова, без лапок, тільки назву):\n${answers.business ?? JSON.stringify(answers)}`;
  const name = (await callClaude(prompt, { system: SYSTEM, maxTokens: 30, temperature: 0.2 })).split('\n')[0].trim();
  return name.replace(/["'.]/g, '').slice(0, 60) || 'Нова компанія';
}
