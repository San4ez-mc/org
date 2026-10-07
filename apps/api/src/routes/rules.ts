import { Router } from 'express';
import { prisma } from '@platform/db';
import { summarize } from '../services/ruleEngine';
import { runRules } from '../services/ruleRunner';

/** Ф2/Ф3: Rule Engine над графом компанії + журнал подій шини. */
export const rules = Router();

rules.get('/companies/:id/rules', async (req, res) => {
  try {
    const violations = await runRules(req.params.id);
    res.json({ summary: summarize(violations), violations });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Динаміка прогонів: чи покращується структура з часом. */
rules.get('/companies/:id/rules/history', async (req, res) => {
  try {
    const runs = await prisma.ruleRun.findMany({
      where: { companyId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, total: true, errors: true, warnings: true, createdAt: true },
    });
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Останні події шини (для налагодження: що опубліковано, що застрягло). */
rules.get('/companies/:id/events', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const events = await prisma.orgEvent.findMany({
      where: { companyId: req.params.id, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, type: true, entityType: true, entityId: true, status: true, attempts: true, lastError: true, createdAt: true, processedAt: true },
    });
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
