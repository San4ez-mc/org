'use server';
import { revalidatePath } from 'next/cache';

const BASE = process.env.ORG_API_URL ?? 'http://127.0.0.1:4100/api';
const TOKEN = process.env.ORG_API_TOKEN ?? '';

/** Створити компанію (лише запис у БД). Повертає id для переходу на сторінку. */
export async function createCompany(data: { name: string; abbr?: string }): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/companies`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, author: 'пульт' }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Не вдалось створити компанію (${res.status})`);
  const j = await res.json();
  revalidatePath('/');
  return { id: j.company.id };
}
