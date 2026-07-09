import { prisma } from '@platform/db';
import { buildCompanyStructure, ensureDoc, appendSheetValues } from '@platform/drive';
import { companyStarterNotes, suggestCompanyName, type OnboardingAnswers } from '@platform/ai';

export interface AgentIntent {
  action: string;
  params?: Record<string, unknown>;
}

export interface AgentContext {
  telegramId?: string;
  companyId?: string;
}

export interface AgentResult {
  reply: string;
  companyId?: string;
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Обробка наміру від бота-воронки.
 * У I5 реалізовано onboarding_generate (створення компанії наскрізь);
 * решта дій — заглушки з тим самим контрактом, додаються далі.
 */
export async function handleAct(intent: AgentIntent, ctx: AgentContext): Promise<AgentResult> {
  switch (intent.action) {
    case 'onboarding_generate':
      return onboardingGenerate((intent.params ?? {}) as OnboardingAnswers, ctx);
    case 'status':
      return status(ctx);
    default:
      return { reply: `Дія «${intent.action}» скоро буде доступна. Поки що я вмію створити структуру компанії — почнімо з опису бізнесу.` };
  }
}

async function onboardingGenerate(answers: OnboardingAnswers, ctx: AgentContext): Promise<AgentResult> {
  const root = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error('DRIVE_ROOT_FOLDER_ID не задано');

  const name = await suggestCompanyName(answers);
  const notes = await companyStarterNotes(answers);

  const built = await buildCompanyStructure(root, name);
  await ensureDoc(built.companyFolderId, 'Рекомендації під твій бізнес', notes);
  await appendSheetValues(built.journalSheetId, [
    [nowStamp(), 'Створено компанію', name, 'Канонічна структура + рекомендації під бізнес', ctx.telegramId ?? ''],
  ]);

  // Персистенція в БД (не блокує успіх на Drive)
  let companyId: string | undefined;
  try {
    const company = await prisma.company.create({
      data: { name, driveRootFolderId: built.companyFolderId, orgSheetId: built.orgSheetId },
      select: { id: true },
    });
    companyId = company.id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[agent] не вдалось зберегти компанію в БД:', (err as Error).message);
  }

  const reply = [
    `✅ Готово! Побудував структуру компанії «${name}» на твоєму Google Drive.`,
    ``,
    `Усередині: 7 відділень → відділи → посадові папки з інструкціями (оригінали — у Відділенні побудови, у папках посад — ярлики), Робочі папки з Архівом, і дашборд (Оргсхема з PAEI-кольорами, Персонал, Журнал).`,
    ``,
    `Ще додав документ «Рекомендації під твій бізнес» — які посади й процеси тобі реально потрібні.`,
    ``,
    `📂 ${built.url}`,
    ``,
    `Далі можемо додати конкретні посади, процеси чи призначити людей — просто напиши, що робимо.`,
  ].join('\n');

  return { reply, companyId };
}

async function status(ctx: AgentContext): Promise<AgentResult> {
  if (!ctx.companyId) return { reply: 'Компанія ще не створена. Розкажи про свій бізнес — і я побудую структуру.' };
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { name: true, driveRootFolderId: true } });
  if (!company) return { reply: 'Не знайшов компанію. Почнімо спочатку — розкажи про бізнес.' };
  return {
    reply: `Компанія «${company.name}». Структура на Drive: https://drive.google.com/drive/folders/${company.driveRootFolderId}`,
    companyId: ctx.companyId,
  };
}
