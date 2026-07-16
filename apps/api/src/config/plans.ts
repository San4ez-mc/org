/** Каталог тарифів платформи (Фаза 3 — Комерція). Оплата поки без шлюзу — рахунки виставляються вручну. */
export interface PlanDef {
  code: string;
  name: string;
  priceUAH: number; // грн/міс, 0 = безкоштовний тріал
  memberLimit: number | null; // null = без обмежень
  description: string;
}

export const TRIAL_DAYS = 14;

export const PLANS: PlanDef[] = [
  { code: 'start', name: 'Старт', priceUAH: 0, memberLimit: 5, description: `Безкоштовний тріал на ${TRIAL_DAYS} днів — до 5 працівників, повний доступ до пульта.` },
  { code: 'standard', name: 'Стандарт', priceUAH: 990, memberLimit: 30, description: 'До 30 працівників, усі можливості пульта та бота.' },
  { code: 'business', name: 'Бізнес', priceUAH: 2490, memberLimit: null, description: 'Необмежена кількість працівників, пріоритетна підтримка.' },
];

export function getPlan(code: string | null | undefined): PlanDef {
  return PLANS.find((p) => p.code === code) ?? PLANS[0];
}
