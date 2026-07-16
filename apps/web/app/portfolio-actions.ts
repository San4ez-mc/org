'use server';
import { revalidatePath } from 'next/cache';
import type { ImplementationStage } from '@/lib/api';

const BASE = process.env.ORG_API_URL ?? 'http://127.0.0.1:4100/api';
const TOKEN = process.env.ORG_API_TOKEN ?? '';

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function setImplementationStage(companyId: string, implementationStage: ImplementationStage) {
  await call(`/companies/${companyId}`, 'PATCH', { implementationStage, author: 'портфель' });
  revalidatePath('/portfolio');
}

export interface CloneFromResult {
  created: { posts: number; processes: number };
  skipped: { posts: number; processes: number };
}

export async function cloneFromCompany(
  targetId: string,
  sourceCompanyId: string,
  include: { structure: boolean; processes: boolean },
): Promise<CloneFromResult> {
  const result = await call(`/companies/${targetId}/clone-from`, 'POST', { sourceCompanyId, include, author: 'портфель' });
  revalidatePath('/portfolio');
  revalidatePath(`/company/${targetId}`);
  revalidatePath(`/company/${targetId}/structure`);
  revalidatePath(`/company/${targetId}/processes`);
  return result as CloneFromResult;
}
