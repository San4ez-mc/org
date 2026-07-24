'use server';
import { revalidatePath } from 'next/cache';
import type { AnalyzeReport } from '@/lib/drive-types';

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

export async function addMember(companyId: string, data: { firstName: string; lastName?: string; telegramUsername?: string; telegramUserId?: string; postUnitIds?: string[] }) {
  await call(`/companies/${companyId}/members`, 'POST', data);
  revalidatePath(`/company/${companyId}`);
}

export async function updateMember(companyId: string, memberId: string, data: { firstName?: string; lastName?: string; telegramUserId?: string; telegramUsername?: string; email?: string; birthDate?: string }) {
  await call(`/members/${memberId}`, 'PATCH', data);
  revalidatePath(`/company/${companyId}`);
}

export async function deleteMember(companyId: string, memberId: string) {
  await call(`/members/${memberId}`, 'DELETE');
  revalidatePath(`/company/${companyId}`);
}

export async function generateAccessToken(memberId: string): Promise<string> {
  const { token } = await call(`/members/${memberId}/access-token`, 'POST');
  return token as string;
}

export async function assignPost(companyId: string, memberId: string, postUnitId: string) {
  await call(`/members/${memberId}/posts`, 'POST', { postUnitId });
  revalidatePath(`/company/${companyId}`);
}

export async function unassignPost(companyId: string, memberId: string, postUnitId: string) {
  await call(`/members/${memberId}/posts/${postUnitId}`, 'DELETE');
  revalidatePath(`/company/${companyId}`);
}

export async function updateOrgUnit(companyId: string, unitId: string, data: { name?: string; ckp?: string }) {
  await call(`/org-units/${unitId}`, 'PATCH', data);
  revalidatePath(`/company/${companyId}`);
  revalidatePath(`/company/${companyId}/structure`);
}

export async function addPost(companyId: string, parentId: string, name: string) {
  await call(`/companies/${companyId}/org-units`, 'POST', { parentId, name, type: 'POST', author: 'пульт' });
  revalidatePath(`/company/${companyId}/structure`);
  revalidatePath(`/company/${companyId}`);
}

// #218 Перемістити посаду в інший підрозділ (drag&drop)
export async function moveUnit(companyId: string, unitId: string, parentId: string) {
  await call(`/org-units/${unitId}`, 'PATCH', { parentId, author: 'пульт' });
  revalidatePath(`/company/${companyId}/structure`);
  revalidatePath(`/company/${companyId}`);
}

export async function deleteUnit(companyId: string, unitId: string) {
  await call(`/org-units/${unitId}`, 'DELETE', { author: 'пульт' });
  revalidatePath(`/company/${companyId}/structure`);
  revalidatePath(`/company/${companyId}`);
}

interface Step { postTitle: string; action: string; result: string; comment?: string; problem?: boolean; automatable?: boolean }

export async function addProcess(companyId: string, name: string) {
  await call(`/companies/${companyId}/processes`, 'POST', { name, author: 'пульт' });
  revalidatePath(`/company/${companyId}/processes`);
}

export async function updateProcess(companyId: string, processId: string, data: { name?: string; description?: string; steps?: Step[]; graph?: unknown }) {
  await call(`/processes/${processId}`, 'PATCH', { ...data, author: 'пульт' });
  revalidatePath(`/company/${companyId}/processes`);
  revalidatePath(`/company/${companyId}/processes/${processId}`);
}

export async function deleteProcess(companyId: string, processId: string) {
  await call(`/processes/${processId}`, 'DELETE', { author: 'пульт' });
  revalidatePath(`/company/${companyId}/processes`);
}

// ── Статистики по ЦКП ──────────────────────────────────────
export async function addStatistic(companyId: string, data: { orgUnitId: string; name: string; unit?: string; higherIsBetter?: boolean }) {
  await call(`/companies/${companyId}/statistics`, 'POST', { ...data, author: 'пульт' });
  revalidatePath(`/company/${companyId}/stats`);
}

export async function addPoint(companyId: string, statisticId: string, value: number, date?: string) {
  await call(`/statistics/${statisticId}/points`, 'POST', { value, date });
  revalidatePath(`/company/${companyId}/stats`);
}

export async function updateStatistic(companyId: string, statisticId: string, data: { name?: string; unit?: string; higherIsBetter?: boolean; points?: { date: string; value: number }[] }) {
  await call(`/statistics/${statisticId}`, 'PATCH', data);
  revalidatePath(`/company/${companyId}/stats`);
}

export async function deleteStatistic(companyId: string, statisticId: string) {
  await call(`/statistics/${statisticId}`, 'DELETE', { author: 'пульт' });
  revalidatePath(`/company/${companyId}/stats`);
}

// ── #200 Підключення Google Drive-папки + аналіз структури/індексація ──────
/** Витягти id теки з URL Google Drive або прийняти «сирий» id. */
function extractFolderId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/) ?? s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{16,}$/.test(s)) return s; // схоже на «сирий» id
  return null;
}

/** Підключити (або відв'язати) кореневу Drive-папку компанії. */
export async function connectDriveFolder(companyId: string, input: string): Promise<{ folderId: string | null }> {
  const folderId = input.trim() ? extractFolderId(input) : null;
  if (input.trim() && !folderId) throw new Error('Не вдалось розпізнати id папки. Встав посилання виду drive.google.com/drive/folders/… або сам id.');
  await call(`/companies/${companyId}`, 'PATCH', { driveRootFolderId: folderId });
  revalidatePath(`/company/${companyId}`);
  return { folderId };
}

/** Проаналізувати підключену папку: зіставити теки з одиницями + (опц.) індексація у вектор. */
export async function analyzeDrive(companyId: string, index = true): Promise<AnalyzeReport> {
  const report = (await call(`/companies/${companyId}/analyze-drive`, 'POST', { index, author: 'пульт' })) as AnalyzeReport;
  revalidatePath(`/company/${companyId}`);
  return report;
}
