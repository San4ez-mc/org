import { prisma } from '@platform/db';
import { evaluateRules, type RuleViolation } from './ruleEngine';

/** Зібрати знімок графа компанії з БД і прогнати Rule Engine (Ф2). */
export async function runRules(companyId: string): Promise<RuleViolation[]> {
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
  return evaluateRules({
    // Носій посади буває і в MemberPost, і лише текстом holderName (так пише асистент).
    units: units.map((u) => ({ ...u, activeHolders: u._count.memberPosts + (u.holderName?.trim() ? 1 : 0) })),
    processes,
    members: members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName ?? ''}`.trim(), activePosts: m._count.posts })),
    disputedFacts: disputed,
  });
}
