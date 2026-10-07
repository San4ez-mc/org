import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@platform/db';

/**
 * Ф4: тихий канал (REDFLAG). Працівник → напряму супер-адміну.
 *
 * Чого тут НЕМАЄ навмисно: publishEvent, logChange, orgNotification. Будь-який з
 * них лишив би слід, який бачить керівник (журнал, сповіщення, шина). Також кінцева
 * точка запису повертає лише {ok} — без id і змісту.
 *
 * Читання/керування — тільки з заголовком x-org-admin-key (ORG_ADMIN_KEY). Спільний
 * PLATFORM_API_SECRET знають усі сервіси й воронки, тому для цього він не годиться.
 * Ключ не заданий → ендпоінти закриті (fail closed).
 */
export const redflags = Router();

function adminOnly(req: any, res: any, next: any) {
  const expected = process.env.ORG_ADMIN_KEY;
  if (!expected) return res.status(503).json({ error: 'ORG_ADMIN_KEY не налаштовано' });
  const got = String(req.header('x-org-admin-key') ?? '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).json({ error: 'forbidden' });
  next();
}

const STATUSES = ['open', 'checking', 'closed', 'dismissed'];

/** Працівник піднімає прапорець за своїм особистим токеном. */
redflags.post('/me/:token/redflag', async (req, res) => {
  try {
    const member = await prisma.member.findUnique({
      where: { accessToken: req.params.token },
      select: { id: true, companyId: true },
    });
    if (!member) return res.status(404).json({ error: 'not found' });
    const text = String(req.body?.text ?? '').trim();
    if (text.length < 5) return res.status(400).json({ error: 'Опишіть, що не так (мінімум 5 символів)' });
    await prisma.redFlag.create({
      data: {
        companyId: member.companyId,
        memberId: member.id,
        entityType: req.body?.entityType ? String(req.body.entityType).slice(0, 40) : null,
        entityId: req.body?.entityId ? String(req.body.entityId).slice(0, 80) : null,
        text: text.slice(0, 4000),
      },
    });
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'не вдалось' });
  }
});

redflags.get('/admin/redflags', adminOnly, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' && STATUSES.includes(req.query.status) ? req.query.status : undefined;
    const flags = await prisma.redFlag.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    // Підтягуємо імена вручну (звʼязків у схемі нема — ізоляція).
    const memberIds = [...new Set(flags.map((f) => f.memberId).filter(Boolean) as string[])];
    const companyIds = [...new Set(flags.map((f) => f.companyId))];
    const [members, companies] = await Promise.all([
      prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, firstName: true, lastName: true } }),
      prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }),
    ]);
    const mName = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName ?? ''}`.trim()]));
    const cName = new Map(companies.map((c) => [c.id, c.name]));
    res.json({
      flags: flags.map((f) => ({ ...f, memberName: f.memberId ? mName.get(f.memberId) ?? null : null, companyName: cName.get(f.companyId) ?? null })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

redflags.patch('/admin/redflags/:id', adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body ?? {};
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: `status: ${STATUSES.join(' | ')}` });
    const flag = await prisma.redFlag.update({
      where: { id: req.params.id },
      data: { ...(status !== undefined && { status }), ...(adminNote !== undefined && { adminNote: String(adminNote).slice(0, 4000) || null }) },
    });
    res.json({ flag });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
