'use server';
import { revalidatePath } from 'next/cache';

const BASE = process.env.ORG_API_URL ?? 'http://127.0.0.1:4100/api';
const TOKEN = process.env.ORG_API_TOKEN ?? '';

export type MyProfileInput = {
  firstName?: string;
  lastName?: string;
  telegramUsername?: string;
  email?: string;
  birthDate?: string;
  photoUrl?: string;
};

// #236 Самореєстрація: працівник оновлює власний профіль за токеном.
export async function updateMyProfile(token: string, data: MyProfileInput) {
  const res = await fetch(`${BASE}/me/${token}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Не вдалося зберегти профіль (${res.status})`);
  revalidatePath(`/me/${token}`);
}

// Ф4: тихий канал. Нічого не повертаємо, окрім успіху, і не ревалідуємо сторінку.
export async function raiseRedFlag(token: string, text: string) {
  const res = await fetch(`${BASE}/me/${token}/redflag`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    cache: 'no-store',
  });
  if (res.status === 400) throw new Error('Опишіть, будь ласка, що не так (хоча б кілька слів).');
  if (!res.ok) throw new Error('Не вдалося надіслати. Спробуйте пізніше.');
}
