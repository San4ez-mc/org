'use server';
import { revalidatePath } from 'next/cache';
import { currentAccess } from '@/lib/access';

const BASE = process.env.ORG_API_URL ?? 'http://127.0.0.1:4100/api';
const TOKEN = process.env.ORG_API_TOKEN ?? '';
const ADMIN_KEY = process.env.ORG_ADMIN_KEY ?? '';

/** Лише супер-адмін. Перевірка тут, а не лише на сторінці: server action можна викликати напряму. */
async function requireSuperadmin() {
  const a = await currentAccess();
  if (!a || a.role !== 'superadmin') throw new Error('forbidden');
}

export interface RedFlagRow {
  id: string;
  companyId: string;
  companyName: string | null;
  memberName: string | null;
  text: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

export async function listRedFlags(): Promise<RedFlagRow[]> {
  await requireSuperadmin();
  const res = await fetch(`${BASE}/admin/redflags`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'x-org-admin-key': ADMIN_KEY },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Не вдалось завантажити (${res.status})`);
  return (await res.json()).flags;
}

export async function updateRedFlag(id: string, data: { status?: string; adminNote?: string }) {
  await requireSuperadmin();
  const res = await fetch(`${BASE}/admin/redflags/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'x-org-admin-key': ADMIN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Не вдалось зберегти (${res.status})`);
  revalidatePath('/redflags');
}
