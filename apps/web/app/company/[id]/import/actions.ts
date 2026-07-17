'use server';
import { revalidatePath } from 'next/cache';

const BASE = process.env.ORG_API_URL ?? 'http://127.0.0.1:4100/api';
const TOKEN = process.env.ORG_API_TOKEN ?? '';

export interface ImportSummary {
  rows: number;
  divisionsCreated: number;
  departmentsCreated: number;
  postsCreated: number;
  membersCreated: number;
  membersAssigned: number;
  errors: { row: number; error: string }[];
}

export type ImportResult =
  | { ok: true; dryRun: boolean; summary: ImportSummary }
  | { ok: false; error: string };

export async function importCsv(companyId: string, csv: string, dryRun: boolean): Promise<ImportResult> {
  if (!csv.trim()) return { ok: false, error: 'Порожній текст CSV.' };
  try {
    const res = await fetch(`${BASE}/companies/${companyId}/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv, dryRun }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    if (!dryRun) revalidatePath(`/company/${companyId}`);
    return { ok: true, dryRun: Boolean(data?.dryRun), summary: data.summary as ImportSummary };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
