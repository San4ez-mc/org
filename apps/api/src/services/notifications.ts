import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '@platform/db';

/**
 * Сповіщення (Telegram/email): затвердження, зміни, вакансії.
 * Каналами є ті самі поля Member.telegramUserId / Member.email — окремого
 * налаштування «підписки» поки нема, шлемо на всі канали, що є в контакті.
 * Якщо TELEGRAM_BOT_TOKEN / SMTP_* не задані — тихо пропускаємо канал.
 */
export type NotificationKind = 'change' | 'vacancy' | 'approval';

interface NotifyOptions {
  companyId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Кому слати. За замовчуванням — власники компанії (OWNER). */
  memberIds?: string[];
}

let cachedTransport: Transporter | null | undefined;

function emailTransport(): Transporter | null {
  if (cachedTransport !== undefined) return cachedTransport;
  const host = process.env.SMTP_HOST;
  if (!host) {
    cachedTransport = null;
    return cachedTransport;
  }
  cachedTransport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return cachedTransport;
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] sendTelegram помилка:', (err as Error).message);
    return false;
  }
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const transport = emailTransport();
  if (!transport) return false;
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] sendEmail помилка:', (err as Error).message);
    return false;
  }
}

/** Надіслати сповіщення учасникам компанії (за замовчуванням — власникам) і залогувати спробу. */
export async function notifyCompany(opts: NotifyOptions): Promise<void> {
  const { companyId, kind, title, body, memberIds } = opts;
  try {
    const recipients = await prisma.member.findMany({
      where: { companyId, ...(memberIds && memberIds.length ? { id: { in: memberIds } } : { role: 'OWNER' }) },
      select: { id: true, telegramUserId: true, email: true },
    });
    const text = `${title}\n\n${body}`;
    for (const m of recipients) {
      const channels: string[] = [];
      if (m.telegramUserId) channels.push((await sendTelegram(m.telegramUserId, text)) ? 'telegram:ok' : 'telegram:fail');
      if (m.email) channels.push((await sendEmail(m.email, title, body)) ? 'email:ok' : 'email:fail');
      await prisma.eventLog
        .create({
          data: {
            level: 'info',
            source: 'notify',
            message: `[${kind}] ${title} → ${m.id} (${channels.length ? channels.join(', ') : 'немає каналу (ні telegram, ні email)'})`,
            companyId,
          },
        })
        .catch(() => {});
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] notifyCompany помилка:', (err as Error).message);
  }
}

/** Надіслати одному конкретному учаснику (напр. автору пропозиції про рішення щодо неї). */
export async function notifyMember(memberId: string, kind: NotificationKind, title: string, body: string): Promise<void> {
  try {
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, companyId: true, telegramUserId: true, email: true } });
    if (!m) return;
    const text = `${title}\n\n${body}`;
    const channels: string[] = [];
    if (m.telegramUserId) channels.push((await sendTelegram(m.telegramUserId, text)) ? 'telegram:ok' : 'telegram:fail');
    if (m.email) channels.push((await sendEmail(m.email, title, body)) ? 'email:ok' : 'email:fail');
    await prisma.eventLog
      .create({
        data: {
          level: 'info',
          source: 'notify',
          message: `[${kind}] ${title} → ${m.id} (${channels.length ? channels.join(', ') : 'немає каналу (ні telegram, ні email)'})`,
          companyId: m.companyId,
        },
      })
      .catch(() => {});
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] notifyMember помилка:', (err as Error).message);
  }
}
