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
}

export interface Process {
  id: string;
  name: string;
  description: string | null;
  steps: ProcessStep[] | null;
  diagram: string | null;
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

export async function getLogs(): Promise<EventLog[]> {
  const { logs } = await api<{ logs: EventLog[] }>(`/logs`);
  return logs;
}
