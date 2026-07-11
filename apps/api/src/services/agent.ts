import { prisma } from '@platform/db';
import { buildCompanyStructure, addCompanyPost, ensureDoc, ensureFolder, appendSheetValues } from '@platform/drive';
import {
  companyStarterNotes,
  mapBusinessToStructure,
  generateProcesses,
  generateProcessMermaid,
  processDocText,
  stepsToMermaid,
  type OnboardingAnswers,
  type GeneratedProcess,
} from '@platform/ai';
import { CANONICAL_DIVISIONS } from '@platform/org-template';
import { knowledgeContextFor } from './knowledge';

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

  // Побудова структури триває кілька хвилин — не тримаємо HTTP-запит бота.
  // Запускаємо у фоні, а готове посилання надсилаємо в Telegram по завершенні.
  void buildAndNotify(answers, ctx, root).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[agent] фонова побудова впала:', err);
    if (ctx.telegramId) {
      void sendTelegram(ctx.telegramId, '⚠️ Сталася помилка під час побудови структури. Ми вже дивимось — спробуй трохи згодом.');
    }
  });

  return {
    reply: '🛠 Прийняв! Будую структуру твоєї компанії на Google Drive — це займе 2–3 хвилини. Щойно все буде готово, надішлю сюди посилання. ✨',
  };
}

async function buildAndNotify(answers: OnboardingAnswers, ctx: AgentContext, root: string): Promise<void> {
  // Методологія з бази знань — для мапінгу і рекомендацій
  const kb = await knowledgeContextFor(
    `${answers.business ?? ''} ${(answers.functions ?? []).join(' ')} орг структура посади ЦКП`,
    5,
  ).catch(() => '');

  // ШІ розкладає реальні посади на 7 відділень
  const spec = await mapBusinessToStructure(answers, kb);
  const name = spec.companyName?.trim() || 'Нова компанія';
  const notes = await companyStarterNotes(answers, kb);

  // Канонічний каркас + тейлоровані посади на Drive
  const built = await buildCompanyStructure(root, name);
  await ensureDoc(built.companyFolderId, 'Рекомендації під твій бізнес', notes);
  for (const p of spec.posts) {
    try {
      await addCompanyPost(built.companyFolderId, p.boardNo, p.title, p.ckp);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[agent] посада не створилась:', p.title, (err as Error).message);
    }
  }

  // Ключові бізнес-процеси (потоки цінності) → Google Docs
  const postTitles = spec.posts.map((p) => p.title);
  const processes: GeneratedProcess[] = await generateProcesses(answers, postTitles, kb).catch(() => []);
  // Swimlane-діаграма кожного процесу (окремий виклик, з fallback)
  for (const pr of processes) {
    pr.mermaid = (await generateProcessMermaid(pr, postTitles).catch(() => '')) || stepsToMermaid(pr.steps);
  }
  if (processes.length) {
    const procFolder = await ensureFolder(built.companyFolderId, 'Бізнес-процеси');
    for (const pr of processes) {
      try {
        await ensureDoc(procFolder, pr.name, processDocText(pr.name, pr.description, pr.steps, pr.mermaid));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[agent] процес не створився:', pr.name, (err as Error).message);
      }
    }
  }

  await appendSheetValues(built.journalSheetId, [
    [nowStamp(), 'Створено компанію', name, `${spec.posts.length} посад + ${processes.length} процесів`, ctx.telegramId ?? ''],
  ]);

  // Персист у БД: компанія + відділення + тейлоровані посади
  try {
    const company = await prisma.company.create({
      data: { name, driveRootFolderId: built.companyFolderId, orgSheetId: built.orgSheetId },
      select: { id: true },
    });
    for (const div of CANONICAL_DIVISIONS) {
      const divUnit = await prisma.orgUnit.create({
        data: { companyId: company.id, type: 'DIVISION', name: div.name, boardNo: div.boardNo, ckp: div.ckp },
        select: { id: true },
      });
      // Голова відділення
      await prisma.orgUnit.create({
        data: { companyId: company.id, parentId: divUnit.id, type: 'POST', name: 'Голова відділення', ckp: div.ckp, isVacant: true },
      });
      // Канонічні відділи (з ЦКП) + керівник кожного відділу
      for (const dept of div.departments) {
        const deptUnit = await prisma.orgUnit.create({
          data: { companyId: company.id, parentId: divUnit.id, type: 'DEPARTMENT', name: dept.name, boardNo: dept.boardNo, ckp: dept.ckp },
          select: { id: true },
        });
        await prisma.orgUnit.create({
          data: { companyId: company.id, parentId: deptUnit.id, type: 'POST', name: 'Керівник відділу', ckp: dept.ckp, isVacant: true },
        });
      }
      for (const p of spec.posts.filter((x) => x.boardNo === div.boardNo)) {
        // Тримач — лише реальне ім'я людини, ніколи не назва посади
        const realHolder = p.holderName && p.holderName.trim() && p.holderName.trim() !== p.title.trim() ? p.holderName.trim() : null;
        await prisma.orgUnit.create({
          data: {
            companyId: company.id,
            parentId: divUnit.id,
            type: 'POST',
            name: p.title,
            ckp: p.ckp,
            holderName: realHolder,
            isVacant: !realHolder,
          },
        });
      }
    }
    for (const pr of processes) {
      await prisma.process.create({
        data: {
          companyId: company.id,
          name: pr.name,
          description: pr.description,
          steps: pr.steps as object,
          diagram: (pr.mermaid && pr.mermaid.trim()) || stepsToMermaid(pr.steps),
        },
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[agent] не вдалось зберегти структуру в БД:', (err as Error).message);
  }

  const postsList = spec.posts.map((p) => `• ${p.title}`).join('\n');
  const finalReply = [
    `✅ Готово! Побудував структуру компанії «${name}» на твоєму Google Drive.`,
    ``,
    `Розклав твої посади по відділеннях:`,
    postsList,
    ``,
    processes.length ? `А ще побудував ${processes.length} ключових бізнес-процеси (папка «Бізнес-процеси»): ${processes.map((p) => p.name).join(', ')}.` : ``,
    ``,
    `Оригінали інструкцій — у Відділенні побудови, у папках посад — ярлики (зміниш оригінал — оновиться в усіх). Плюс Робочі папки з Архівом і дашборд (Оргсхема з PAEI-кольорами, Персонал, Журнал), а також документ «Рекомендації під твій бізнес».`,
    ``,
    `📂 ${built.url}`,
    ``,
    `Далі можемо додати процеси, призначити людей або відкоригувати посади — просто напиши.`,
  ].join('\n');

  if (ctx.telegramId) await sendTelegram(ctx.telegramId, finalReply);
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[agent] sendTelegram помилка:', (err as Error).message);
  }
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
