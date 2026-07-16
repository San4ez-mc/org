import { prisma } from '@platform/db';
import { PLANS, TRIAL_DAYS, getPlan } from '../config/plans';

export type BillingState = 'trial' | 'active' | 'past_due' | 'expired';

interface CompanyBillingFields {
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  subscriptionRenewsAt: Date | null;
}

/** Компанія створена до впровадження білінгу (усі поля ще незайняті) — не обмежуємо заднім числом. */
function isUnbilled(c: CompanyBillingFields): boolean {
  return c.subscriptionPlan === null && c.subscriptionStatus === null && c.trialEndsAt === null;
}

/** Обчислює живий стан підписки — БД тримає лише сирі поля, стан завжди рахуємо від "зараз". */
export function computeBillingState(c: CompanyBillingFields): BillingState {
  if (isUnbilled(c)) return 'active';
  const now = new Date();
  if (c.subscriptionStatus === 'active') {
    return c.subscriptionRenewsAt && c.subscriptionRenewsAt < now ? 'past_due' : 'active';
  }
  if (c.trialEndsAt && c.trialEndsAt > now) return 'trial';
  return 'expired';
}

/** Стартові поля білінгу для щойно створеної компанії — тріал на TRIAL_DAYS. */
export function trialFieldsForNewCompany() {
  return {
    subscriptionPlan: PLANS[0].code,
    subscriptionStatus: 'trial',
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export async function getBillingSummary(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      subscriptionRenewsAt: true,
      _count: { select: { members: true } },
    },
  });
  if (!company) return null;

  const state = computeBillingState(company);
  const legacy = isUnbilled(company);
  const plan = getPlan(company.subscriptionPlan);
  const invoices = await prisma.invoice.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 20 });

  return {
    plan: plan.code,
    planDef: plan,
    status: company.subscriptionStatus,
    state,
    legacy, // компанія існувала до впровадження білінгу — ліміти нижче не застосовуються
    trialEndsAt: company.trialEndsAt,
    subscriptionRenewsAt: company.subscriptionRenewsAt,
    memberCount: company._count.members,
    memberLimit: legacy ? null : plan.memberLimit,
    plans: PLANS,
    invoices,
  };
}

export async function canAddMember(companyId: string): Promise<{ ok: boolean; reason?: string }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      subscriptionRenewsAt: true,
      _count: { select: { members: true } },
    },
  });
  if (!company) return { ok: false, reason: 'Компанію не знайдено' };
  if (isUnbilled(company)) return { ok: true }; // компанія створена до впровадження білінгу

  const state = computeBillingState(company);
  if (state === 'expired') {
    return { ok: false, reason: 'Підписку не активовано або її дію завершено — оформіть тариф на сторінці «Білінг».' };
  }

  const plan = getPlan(company.subscriptionPlan);
  if (plan.memberLimit !== null && company._count.members >= plan.memberLimit) {
    return { ok: false, reason: `Ліміт тарифу «${plan.name}» — ${plan.memberLimit} працівників. Оновіть тариф на сторінці «Білінг».` };
  }
  return { ok: true };
}
