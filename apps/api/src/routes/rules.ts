import { Router } from 'express';
import { prisma } from '@platform/db';
import { evaluateRules, summarize } from '../services/ruleEngine';

/** Ф2: Rule Engine над графом компанії. Читає БД, самі правила — у services/ruleEngine. */
export const rules = Router();

rules.get('/companies/:id/rules', async (req, res) => {
  try {
    const companyId = req.params.id;
    const [units, processes, members, disputed] = await Promise.all([
      prisma.orgUnit.findMany({
        where: { companyId },
        select: {
          id: true, name: true, type: true, parentId: true, ckp: true, isVacant: true, reportsToUnitId: true, holderName: true,
          _count: { select: { memberPosts: { where: { removedAt: null } } } },
        },
      }),
      prisma.process.findMany({ where: { companyId }, select: { id: true, name: true, ownerUnitId: true, steps: true } }),
      prisma.member.findMany({
        where: { companyId },
        select: { id: true, firstName: true, lastName: true, _count: { select: { posts: { where: { removedAt: null } } } } },
      }),
      prisma.factProvenance.findMany({
        where: { companyId, status: 'disputed', confidential: false },
        select: { id: true, entityType: true, entityId: true, field: true },
      }),
    ]);
    const violations = evaluateRules({
      // Носій посади буває і в MemberPost, і лише текстом holderName (так пише асистент).
      units: units.map((u) => ({ ...u, activeHolders: u._count.memberPosts + (u.holderName?.trim() ? 1 : 0) })),
      processes,
      members: members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName ?? ''}`.trim(), activePosts: m._count.posts })),
      disputedFacts: disputed,
    });
    res.json({ summary: summarize(violations), violations });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
