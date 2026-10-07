/**
 * Ф2: Rule Engine — детерміновані перевірки несуперечності над графом структури.
 * Без ШІ і без вектора: чисті реляційні правила, кожне повертає «діра тут» з
 * посиланням на вузол. Живить панель довіри, health і (далі) Delivery Engine.
 *
 * evaluateRules — чиста функція над знімком графа, тому тестується без БД.
 */

export type Severity = 'error' | 'warning' | 'info';

export interface RuleUnit {
  id: string;
  name: string;
  type: 'DIVISION' | 'DEPARTMENT' | 'SECTION' | 'POST';
  parentId: string | null;
  ckp: string | null;
  isVacant: boolean;
  reportsToUnitId: string | null;
  activeHolders: number; // чинні призначення MemberPost
}

export interface RuleProcess {
  id: string;
  name: string;
  ownerUnitId: string | null;
  steps: unknown; // [{ postTitle, action, result, unitId? }]
}

export interface RuleMember {
  id: string;
  name: string;
  activePosts: number;
}

export interface RuleSnapshot {
  units: RuleUnit[];
  processes: RuleProcess[];
  members: RuleMember[];
  disputedFacts?: { id: string; entityType: string; entityId: string; field: string | null }[];
}

export interface RuleViolation {
  rule: string;
  severity: Severity;
  entityType: 'orgUnit' | 'process' | 'member' | 'fact';
  entityId: string;
  message: string;
}

export const OVERLOAD_POSTS = 5;

const blank = (v: string | null | undefined) => v == null || v.trim() === '';
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();

export function evaluateRules(s: RuleSnapshot): RuleViolation[] {
  const out: RuleViolation[] = [];
  const byId = new Map(s.units.map((u) => [u.id, u]));
  const posts = s.units.filter((u) => u.type === 'POST');
  const add = (v: RuleViolation) => out.push(v);

  // R1 / R2 — ЦКП обовʼязковий на кожному рівні
  for (const u of s.units) {
    if (blank(u.ckp)) {
      add({
        rule: u.type === 'POST' ? 'POST_NO_CKP' : 'UNIT_NO_CKP',
        severity: u.type === 'POST' ? 'error' : 'warning',
        entityType: 'orgUnit',
        entityId: u.id,
        message: `«${u.name}» без ЦКП`,
      });
    }
  }

  // R3 — відділення без жодної зайнятої посади в піддереві
  const childrenOf = new Map<string, RuleUnit[]>();
  for (const u of s.units) {
    if (u.parentId) childrenOf.set(u.parentId, [...(childrenOf.get(u.parentId) ?? []), u]);
  }
  const subtreeHasHolder = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return (childrenOf.get(id) ?? []).some(
      (c) => (c.type === 'POST' && !c.isVacant && c.activeHolders > 0) || subtreeHasHolder(c.id, seen),
    );
  };
  for (const d of s.units.filter((u) => u.type === 'DIVISION')) {
    if (!subtreeHasHolder(d.id)) {
      add({ rule: 'DIVISION_NO_HEAD', severity: 'error', entityType: 'orgUnit', entityId: d.id, message: `Відділення «${d.name}» без жодної зайнятої посади` });
    }
  }

  // R4 — двоє за одне ЦКП
  const byCkp = new Map<string, RuleUnit[]>();
  for (const p of posts) {
    if (blank(p.ckp)) continue;
    const k = norm(p.ckp!);
    byCkp.set(k, [...(byCkp.get(k) ?? []), p]);
  }
  for (const group of byCkp.values()) {
    if (group.length < 2) continue;
    const names = group.map((g) => `«${g.name}»`).join(', ');
    for (const p of group) {
      add({ rule: 'DUPLICATE_CKP', severity: 'warning', entityType: 'orgUnit', entityId: p.id, message: `Однакове ЦКП у посад: ${names}` });
    }
  }

  // R5 — циклічне підпорядкування
  for (const p of posts) {
    const seen = new Set<string>();
    let cur: RuleUnit | undefined = p;
    while (cur && cur.reportsToUnitId) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      cur = byId.get(cur.reportsToUnitId);
      if (cur && cur.id === p.id) {
        add({ rule: 'REPORTS_CYCLE', severity: 'error', entityType: 'orgUnit', entityId: p.id, message: `Циклічне підпорядкування: «${p.name}»` });
        break;
      }
    }
  }

  // R6–R8 — процеси
  const postNames = new Set(posts.map((p) => norm(p.name)));
  for (const pr of s.processes) {
    const steps = Array.isArray(pr.steps) ? (pr.steps as any[]) : [];
    if (steps.length === 0) {
      add({ rule: 'PROCESS_NO_STEPS', severity: 'warning', entityType: 'process', entityId: pr.id, message: `Процес «${pr.name}» без кроків` });
      continue;
    }
    if (!pr.ownerUnitId) {
      add({ rule: 'PROCESS_NO_OWNER', severity: 'warning', entityType: 'process', entityId: pr.id, message: `Процес «${pr.name}» без власника` });
    }
    steps.forEach((st, i) => {
      const title = typeof st?.postTitle === 'string' ? st.postTitle : '';
      const idOk = typeof st?.unitId === 'string' && byId.has(st.unitId);
      if (blank(title) && !idOk) {
        add({ rule: 'STEP_NO_RESPONSIBLE', severity: 'error', entityType: 'process', entityId: pr.id, message: `«${pr.name}», крок ${i + 1}: немає відповідального` });
      } else if (!idOk && !postNames.has(norm(title))) {
        add({ rule: 'STEP_UNKNOWN_POST', severity: 'error', entityType: 'process', entityId: pr.id, message: `«${pr.name}», крок ${i + 1}: посади «${title}» немає в структурі` });
      }
    });
  }

  // R9 — одна людина на забагато посад
  for (const m of s.members) {
    if (m.activePosts >= OVERLOAD_POSTS) {
      add({ rule: 'MEMBER_OVERLOAD', severity: 'warning', entityType: 'member', entityId: m.id, message: `${m.name} на ${m.activePosts} посадах` });
    }
  }

  // R10 — на спірному факті не будуємо «здорову» оцінку (звʼязок з Ф1)
  for (const f of s.disputedFacts ?? []) {
    add({ rule: 'DISPUTED_FACT', severity: 'warning', entityType: 'fact', entityId: f.id, message: `Спірний факт: ${f.entityType}${f.field ? '.' + f.field : ''}` });
  }

  return out;
}

export function summarize(v: RuleViolation[]) {
  const byRule: Record<string, number> = {};
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const x of v) {
    byRule[x.rule] = (byRule[x.rule] ?? 0) + 1;
    bySeverity[x.severity]++;
  }
  return { total: v.length, byRule, bySeverity };
}
