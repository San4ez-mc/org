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

export interface CompanyDetail extends Company {
  orgUnits: OrgUnit[];
  processes: Process[];
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
