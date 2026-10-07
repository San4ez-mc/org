import { Router } from 'express';
import { prisma } from '@platform/db';

/**
 * Ф1: провенанс фактів і панель довіри. Змонтовано в index.ts під тим самим
 * requireApiSecret. Запис провенансу ніколи не блокує основну дію — див. recordFact.
 */
export const provenance = Router();

export const SOURCE_TYPES = ['owner', 'head', 'employee', 'document', 'agent', 'admin'] as const;
export const FACT_STATUSES = ['proposed', 'approved', 'disputed', 'unconfirmed'] as const;

export interface FactInput {
  companyId: string;
  entityType: string;
  entityId: string;
  field?: string | null;
  value?: string | null;
  sourceType: (typeof SOURCE_TYPES)[number];
  sourceId?: string | null;
  confidence?: number | null;
  status?: (typeof FACT_STATUSES)[number];
  confidential?: boolean;
}

/** Записати провенанс факту. Не кидає: збій тут не має ламати зміну структури. */
export async function recordFact(f: FactInput) {
  try {
    return await prisma.factProvenance.create({
      data: {
        companyId: f.companyId,
        entityType: f.entityType,
        entityId: f.entityId,
        field: f.field ?? null,
        value: f.value ?? null,
        sourceType: f.sourceType,
        sourceId: f.sourceId ?? null,
        confidence: f.confidence ?? null,
        // Агент і документ лише пропонують; людина-джерело — одне слово, ще не перевірене.
        status: f.status ?? (f.sourceType === 'agent' || f.sourceType === 'document' ? 'proposed' : 'unconfirmed'),
        confidential: f.confidential ?? false,
      },
    });
  } catch {
    return null;
  }
}

const bad = (res: any, msg: string) => res.status(400).json({ error: msg });

provenance.get('/companies/:id/provenance', async (req, res) => {
  try {
    const { entityType, entityId, status } = req.query as Record<string, string | undefined>;
    const facts = await prisma.factProvenance.findMany({
      where: {
        companyId: req.params.id,
        confidential: false, // тихий канал не віддаємо звичайним клієнтам API
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json({ facts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

provenance.post('/companies/:id/provenance', async (req, res) => {
  const b = req.body ?? {};
  if (!b.entityType || !b.entityId) return bad(res, 'entityType і entityId обовʼязкові');
  if (!SOURCE_TYPES.includes(b.sourceType)) return bad(res, `sourceType має бути одним з: ${SOURCE_TYPES.join(', ')}`);
  if (b.status && !FACT_STATUSES.includes(b.status)) return bad(res, `status має бути одним з: ${FACT_STATUSES.join(', ')}`);
  const fact = await recordFact({ ...b, companyId: req.params.id });
  if (!fact) return res.status(500).json({ error: 'не вдалось записати' });
  res.status(201).json({ fact });
});

/** Керівник/адмін затверджує або відхиляє (→ disputed) факт. */
provenance.post('/provenance/:id/review', async (req, res) => {
  try {
    const { decision, by } = req.body ?? {};
    if (decision !== 'approve' && decision !== 'dispute') return bad(res, "decision має бути 'approve' або 'dispute'");
    const fact = await prisma.factProvenance.update({
      where: { id: req.params.id },
      data:
        decision === 'approve'
          ? { status: 'approved', approvedBy: by ?? null, approvedAt: new Date() }
          : { status: 'disputed', approvedBy: null, approvedAt: null },
    });
    res.json({ fact });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Панель довіри: частки approved/unconfirmed/proposed/disputed + спірні й непідтверджені. */
provenance.get('/companies/:id/trust', async (req, res) => {
  try {
    const where = { companyId: req.params.id, confidential: false };
    const grouped = await prisma.factProvenance.groupBy({ by: ['status'], where, _count: { _all: true } });
    const counts: Record<string, number> = { approved: 0, proposed: 0, unconfirmed: 0, disputed: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const attention = await prisma.factProvenance.findMany({
      where: { ...where, status: { in: ['disputed', 'proposed'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({
      total,
      counts,
      percent: { approved: pct(counts.approved), proposed: pct(counts.proposed), unconfirmed: pct(counts.unconfirmed), disputed: pct(counts.disputed) },
      attention,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
