// Серверний клієнт до API платформи (викликається з Server Components).
const BASE = process.env.ORG_API_URL ?? 'http://127.0.0.1:4100/api';
const TOKEN = process.env.ORG_API_TOKEN ?? '';

export interface Company {
  id: string;
  name: string;
  abbr: string | null;
  driveRootFolderId: string | null;
  orgSheetId: string | null;
  createdAt: string;
}

export interface OrgUnit {
  id: string;
  parentId: string | null;
  type: 'DIVISION' | 'DEPARTMENT' | 'SECTION' | 'POST';
  name: string;
  ckp: string | null;
  boardNo: number | null;
  holderName: string | null;
  isVacant: boolean;
}

export interface ProcessStep {
  postTitle: string;
  action: string;
  result: string;
  comment?: string;
  problem?: boolean;
  automatable?: boolean;
}

export interface ProcessGraphNode {
  id: string;
  type?: string; // 'step' | 'decision' | 'start' | 'end'
  position: { x: number; y: number };
  data: { label: string; postTitle?: string; kind?: string };
}
export interface ProcessGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
export interface ProcessGraph {
  nodes: ProcessGraphNode[];
  edges: ProcessGraphEdge[];
}

export interface Process {
  id: string;
  name: string;
  description: string | null;
  steps: ProcessStep[] | null;
  diagram: string | null;
  graph: ProcessGraph | null;
}

export interface MemberPost {
  postUnitId: string;
  postUnit: { id: string; name: string };
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  email: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  role: string;
  posts: MemberPost[];
}

export interface CompanyDetail extends Company {
  orgUnits: OrgUnit[];
  processes: Process[];
  members: Member[];
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getCompanies(): Promise<Company[]> {
  const { companies } = await api<{ companies: Company[] }>('/companies');
  return companies;
}

export async function getCompany(id: string): Promise<CompanyDetail> {
  const { company } = await api<{ company: CompanyDetail }>(`/companies/${id}`);
  return company;
}

export interface StatPoint { date: string; value: number }
export interface Statistic {
  id: string;
  orgUnitId: string;
  name: string;
  unit: string | null;
  higherIsBetter: boolean;
  points: StatPoint[];
  orgUnit: { id: string; name: string; type: string };
}

export async function getStatistics(companyId: string): Promise<Statistic[]> {
  const { statistics } = await api<{ statistics: Statistic[] }>(`/companies/${companyId}/statistics`);
  return statistics;
}

export interface MeSummary {
  member: { id: string; firstName: string; lastName: string | null; role: string };
  company: { id: string; name: string } | null;
  posts: { id: string; name: string; ckp: string | null; path: string[] }[];
  processes: { id: string; name: string; description: string | null; steps: ProcessStep[] | null }[];
  statistics: Statistic[];
}

export async function getMe(token: string): Promise<MeSummary | null> {
  try {
    const { summary } = await api<{ summary: MeSummary }>(`/me/${token}`);
    return summary;
  } catch {
    return null;
  }
}

export interface Change {
  id: string;
  entity: string;
  action: string;
  summary: string;
  author: string | null;
  approved: boolean;
  createdAt: string;
}

export async function getChanges(companyId: string): Promise<Change[]> {
  const { changes } = await api<{ changes: Change[] }>(`/companies/${companyId}/changes`);
  return changes;
}

export interface EventLog {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
}

export interface OrgHealthRef { id: string; name: string }
export interface OrgHealth {
  postsTotal: number;
  postsWithoutCkp: OrgHealthRef[];
  postsWithoutCkpCount: number;
  vacantPosts: OrgHealthRef[];
  vacantPostsCount: number;
  processesTotal: number;
  processesDescribed: number;
  processesDescribedPct: number;
  membersWithoutPost: OrgHealthRef[];
  membersWithoutPostCount: number;
}

export async function getCompanyHealth(companyId: string): Promise<OrgHealth> {
  const { health } = await api<{ health: OrgHealth }>(`/companies/${companyId}/health`);
  return health;
}

export async function getLogs(): Promise<EventLog[]> {
  const { logs } = await api<{ logs: EventLog[] }>(`/logs`);
  return logs;
}

export interface DashboardChange {
  id: string;
  entity: string;
  action: string;
  summary: string;
  author: string | null;
  createdAt: string;
}
export interface OwnerDashboard {
  staffing: { postsTotal: number; filled: number; vacant: number; filledPct: number };
  processes: { total: number; described: number; describedPct: number };
  changes: { last7d: number; last30d: number };
  pendingApprovals: number;
  bottlenecks: { label: string; count: number }[];
  recentChanges: DashboardChange[];
}

export async function getOwnerDashboard(companyId: string): Promise<OwnerDashboard> {
  const { dashboard } = await api<{ dashboard: OwnerDashboard }>(`/companies/${companyId}/dashboard`);
  return dashboard;
}

export interface DriveNode {
  id: string;
  name: string;
  isFolder: boolean;
  webViewLink?: string;
  children?: DriveNode[];
}

export async function getInstructions(companyId: string): Promise<DriveNode[]> {
  const { tree } = await api<{ tree: DriveNode[] }>(`/companies/${companyId}/instructions`);
  return tree;
}
