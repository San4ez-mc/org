import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@platform/db';
import { runAsUser } from '@platform/drive';

/**
 * Вмикає делегування для всіх запитів у межах компанії.
 *
 * Навіщо middleware, а не обгортка на кожен виклик: звернень до Диска в платформі
 * два десятки — індексація, дерево тек, аналіз структури, посадові інструкції,
 * інструменти агента. Обгортати кожне окремо означає гарантовано забути одне
 * сьогодні і ще кілька в майбутньому коді. Саме так і сталося: делегування
 * працювало в інструментах бота, а індексація мовчки читала диск сервісного
 * акаунта — і показувала одну чужу теку замість диска клієнта.
 *
 * AsyncLocalStorage підхоплюють усі асинхронні операції, породжені всередині
 * next(), включно з фоновими — тому індексатор, який переживає сам запит,
 * теж успадковує контекст.
 */

/** Коротка памʼять, щоб не ходити в базу на кожен запит підряд. */
const CACHE_MS = 30_000;
const cache = new Map<string, { subject: string | null; at: number }>();

async function impersonationFor(companyId: string): Promise<string | null> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.subject;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleImpersonateUser: true },
  });
  const subject = company?.googleImpersonateUser ?? null;
  cache.set(companyId, { subject, at: Date.now() });
  return subject;
}

/** Скинути кеш після зміни налаштувань — інакше нова пошта підхопиться аж за пів хвилини. */
export function forgetCompanyDriveContext(companyId: string): void {
  cache.delete(companyId);
}

export function companyDriveContext(getCompanyId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const companyId = getCompanyId(req);
    if (!companyId) return void next();

    impersonationFor(companyId)
      .then((subject) => {
        if (!subject) return void next();
        // next() викликається СИНХРОННО всередині run(), тож увесь ланцюжок
        // обробників — і все, що вони запустять асинхронно — бачить контекст.
        void runAsUser(subject, async () => { next(); });
      })
      .catch(() => next()); // недоступна база не має ламати запит — впаде далі, з нормальною помилкою
  };
}
