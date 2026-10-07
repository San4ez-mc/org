import { evaluateRules } from '../apps/api/src/services/ruleEngine';

const u = (id: string, type: any, o: any = {}) => ({ id, name: id, type, parentId: null, ckp: 'ckp-' + id, isVacant: false, reportsToUnitId: null, activeHolders: 1, ...o });
const v = evaluateRules({
  units: [
    u('D1', 'DIVISION'),
    u('D2', 'DIVISION'),
    u('A', 'POST', { parentId: 'D1', reportsToUnitId: 'B' }),
    u('B', 'POST', { parentId: 'D1', reportsToUnitId: 'A', ckp: 'ckp-A' }),
    u('C', 'POST', { parentId: 'D1', ckp: ' ' }),
  ],
  processes: [
    { id: 'P1', name: 'Продаж', ownerUnitId: null, steps: [{ postTitle: 'A' }, { postTitle: '' }, { postTitle: 'Невідома' }] },
    { id: 'P2', name: 'Порожній', ownerUnitId: 'A', steps: [] },
  ],
  members: [{ id: 'M', name: 'Іван', activePosts: 5 }],
  disputedFacts: [{ id: 'F', entityType: 'orgUnit', entityId: 'A', field: 'ckp' }],
});
const rules = new Set(v.map((x) => x.rule));
const want = ['POST_NO_CKP', 'DIVISION_NO_HEAD', 'DUPLICATE_CKP', 'REPORTS_CYCLE', 'PROCESS_NO_STEPS', 'PROCESS_NO_OWNER', 'STEP_NO_RESPONSIBLE', 'STEP_UNKNOWN_POST', 'MEMBER_OVERLOAD', 'DISPUTED_FACT'];
const missing = want.filter((r) => !rules.has(r));
const cycles = v.filter((x) => x.rule === 'REPORTS_CYCLE').length;
console.log({ total: v.length, missing, cycles });
if (missing.length || cycles !== 2 || v.some((x) => x.rule === 'DIVISION_NO_HEAD' && x.entityId === 'D1')) { console.error('FAIL'); process.exit(1); }
console.log('OK');
