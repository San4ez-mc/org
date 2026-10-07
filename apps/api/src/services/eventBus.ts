import { prisma } from '@platform/db';
import { runRules } from './ruleRunner';

/**
 * Ф3: Event Bus. Outbox у Postgres: публікатор пише подію в OrgEvent, споживач
 * (цикл нижче) забирає пачку, групує за компанією і викликає підписників.
 *
 * Ідемпотентність: dedupeKey UNIQUE. Повторна публікація тієї самої події (ретрай
 * агента, подвійний клік) ігнорується, тож не буде подвійних прогонів і сповіщень.
 * Публікація НІКОЛИ не кидає: збій шини не має ламати зміну структури.
 */

export interface OrgEventInput {
  companyId: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: unknown;
  /** Унікальний ключ події. Без нього — тип+сутність+5-секундне вікно. */
  dedupeKey?: string;
}

const WINDOW_MS = 5000;
const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MS = 5 * 60_000;

export async function publishEvent(e: OrgEventInput): Promise<boolean> {
  try {
    await prisma.orgEvent.create({
      data: {
        companyId: e.companyId,
        type: e.type,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        payload: (e.payload ?? undefined) as any,
        dedupeKey:
          e.dedupeKey ?? `${e.companyId}:${e.type}:${e.entityId ?? ''}:${Math.floor(Date.now() / WINDOW_MS)}`,
      },
    });
    return true;
  } catch (err: any) {
    if (err?.code === 'P2002') return false; // дубль — очікувано
    return false;
  }
}

interface ClaimedEvent {
  id: string;
  companyId: string;
  type: string;
  attempts: number;
}

async function claimBatch(limit = 100): Promise<ClaimedEvent[]> {
  // Повертаємо у чергу події, які хтось узяв і не завершив (упав процес).
  await prisma.$executeRaw`UPDATE "OrgEvent" SET status = 'pending'
    WHERE status = 'processing' AND "claimedAt" < ${new Date(Date.now() - STALE_CLAIM_MS)}`;
  return prisma.$queryRaw<ClaimedEvent[]>`
    UPDATE "OrgEvent" SET status = 'processing', attempts = attempts + 1, "claimedAt" = now()
    WHERE id IN (
      SELECT id FROM "OrgEvent" WHERE status = 'pending'
      ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "companyId", type, attempts`;
}

/** Підписник: перерахувати правила й сповістити лише про НОВІ порушення. */
async function recheckRules(companyId: string) {
  const violations = await runRules(companyId);
  const keys = violations.map((v) => `${v.rule}:${v.entityId}`);
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;

  const prev = await prisma.ruleRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  await prisma.ruleRun.create({ data: { companyId, total: violations.length, errors, warnings, keys } });

  // Перший прогін — лише базова лінія: не засипаємо сповіщеннями про вже наявне.
  if (prev) {
    const known = new Set(prev.keys);
    const fresh = violations.filter((v) => !known.has(`${v.rule}:${v.entityId}`));
    const freshErrors = fresh.filter((v) => v.severity === 'error');
    if (freshErrors.length > 0) {
      const sample = freshErrors.slice(0, 3).map((v) => v.message).join('; ');
      await prisma.orgNotification.create({
        data: {
          companyId,
          type: 'rules',
          message: `Нових помилок у структурі: ${freshErrors.length}. ${sample}${freshErrors.length > 3 ? '…' : ''}`,
        },
      });
    }
  }

  // Історію тримаємо короткою.
  const old = await prisma.ruleRun.findMany({
    where: { companyId }, orderBy: { createdAt: 'desc' }, skip: 50, select: { id: true },
  });
  if (old.length) await prisma.ruleRun.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

/** Один прохід споживача. Повертає, скільки подій оброблено. */
export async function processEvents(): Promise<number> {
  const batch = await claimBatch();
  if (batch.length === 0) return 0;

  const byCompany = new Map<string, ClaimedEvent[]>();
  for (const ev of batch) byCompany.set(ev.companyId, [...(byCompany.get(ev.companyId) ?? []), ev]);

  for (const [companyId, events] of byCompany) {
    const ids = events.map((e) => e.id);
    try {
      // Пачка подій однієї компанії = один перерахунок, а не N.
      await recheckRules(companyId);
      await prisma.orgEvent.updateMany({ where: { id: { in: ids } }, data: { status: 'done', processedAt: new Date(), lastError: null } });
    } catch (err) {
      const msg = String((err as any)?.message ?? err).slice(0, 500);
      for (const ev of events) {
        await prisma.orgEvent.update({
          where: { id: ev.id },
          data: { status: ev.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', lastError: msg },
        });
      }
    }
  }
  return batch.length;
}

let timer: NodeJS.Timeout | null = null;
let busy = false;

/** Запустити цикл споживача в цьому процесі. EVENT_BUS=0 вимикає. */
export function startEventLoop(intervalMs = 3000) {
  if (timer || process.env.EVENT_BUS === '0') return;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await processEvents();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[eventbus]', err);
    } finally {
      busy = false;
    }
  }, intervalMs);
  timer.unref?.();
}
