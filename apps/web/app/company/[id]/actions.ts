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

/** #302 Легке дерево Диску (лише метадані) + список виключених id. Для сторінки «Папка». */
export async function getDriveTree(companyId: string): Promise<{ tree: import('@/lib/drive-types').DriveNode[]; excludedIds: string[]; connected: boolean }> {
  return call(`/companies/${companyId}/drive-tree`, 'GET');
}

/** #302 Зберегти теки/файли, виключені з індексації. */
export async function saveDriveExclusions(companyId: string, excludedIds: string[]): Promise<{ excludedIds: string[] }> {
  return call(`/companies/${companyId}/drive-exclusions`, 'PATCH', { excludedIds });
}

export interface DriveIndexStatus {
  running: boolean;
  phase: 'idle' | 'listing' | 'reading' | 'done' | 'error';
  total: number; processed: number; indexed: number;
  startedAt: number | null; finishedAt: number | null; error: string | null;
  etaSeconds: number | null;
}

/** #303 Запустити фонову індексацію робочої папки у вектор. */
export async function startDriveIndex(companyId: string): Promise<{ started: boolean; error?: string }> {
  try {
    await call(`/companies/${companyId}/index-drive/start`, 'POST', {});
    return { started: true };
  } catch (e) {
    return { started: false, error: (e as Error).message };
  }
}

/** #303 Стан фонової індексації (для прогрес-бара). */
export async function getDriveIndexStatus(companyId: string): Promise<DriveIndexStatus> {
  return call(`/companies/${companyId}/index-drive/status`, 'GET');
}

export interface ProposedNode { name: string; type?: string; descUser?: string; descSystem?: string; action?: 'keep' | 'rename' | 'move' | 'new'; origin?: string; children?: ProposedNode[] }
export interface StructureProposal { structure: ProposedNode[]; generatedAt?: string }
/** #311 (3e-1) Отримати збережену пропозицію структури. */
export async function getStructureProposal(companyId: string): Promise<{ proposal: StructureProposal | null }> {
  return call(`/companies/${companyId}/structure-proposal`, 'GET');
}
/** #311 (3e-1) Згенерувати нову пропозицію структури папок (ШІ). */
export async function proposeStructure(companyId: string): Promise<StructureProposal> {
  return call(`/companies/${companyId}/propose-structure`, 'POST', {});
}
/** #311 (3e-2) Зберегти відредаговану пропозицію. */
export async function saveStructureProposal(companyId: string, structure: ProposedNode[]): Promise<{ ok: boolean }> {
  return call(`/companies/${companyId}/structure-proposal`, 'PATCH', { structure });
}
/** #311 (3e-3) Застосувати — створити теки на Диску (без переміщення файлів). */
export async function applyStructure(companyId: string): Promise<{ created: number; folders: { name: string; path: string; id: string }[] }> {
  return call(`/companies/${companyId}/apply-structure`, 'POST', {});
}

export interface InstructionsFolderInfo { current: string | null; suggestions: { id: string; name: string; path: string }[] }
/** #310 (3d) Папка для інструкцій — поточна + кандидати. */
export async function getInstructionsFolder(companyId: string): Promise<InstructionsFolderInfo> {
  return call(`/companies/${companyId}/instructions-folder`, 'GET');
}
/** #310 (3d) Встановити папку для інструкцій (обрати або створити). */
export async function setInstructionsFolder(companyId: string, opts: { folderId?: string; create?: boolean; name?: string }): Promise<{ folderId: string }> {
  return call(`/companies/${companyId}/instructions-folder`, 'POST', opts);
}

export interface DetectedFacts {
  departments: string[];
  positions: { title: string; department?: string; holder?: string }[];
  instructions: { title: string; source?: string }[];
  companyFacts: { sphere?: string; mission?: string };
  sourcesScanned?: number;
}
/** #309 (3c) Авто-визначення відділів/посад/інструкцій із документів. */
export async function detectFacts(companyId: string): Promise<DetectedFacts> {
  return call(`/companies/${companyId}/detect-facts`, 'POST', {});
}

export interface RagSource { source: string; folderId?: string; score?: number; driveFileId?: string | null; path?: string | null }
/** #308 Пошук по базі знань компанії (RAG через флоус + Vertex). */
export async function ragSearch(companyId: string, query: string): Promise<{ answer: string; sources: RagSource[] }> {
  return call(`/companies/${companyId}/search`, 'POST', { query });
}

export interface VectorTokenRow { token: string; label: string; folderScope: string[] | null; isRoot: boolean; createdAt?: string }

/** #307 Список токенів компанії у vector-базі. */
export async function getVectorTokens(companyId: string): Promise<{ tokens: VectorTokenRow[]; connected: boolean }> {
  return call(`/companies/${companyId}/vector/tokens`, 'GET');
}

/** #307 Створити токен, обмежений на вибрані папки (+ їх нащадки). */
export async function createVectorToken(companyId: string, folderIds: string[], label: string): Promise<{ token: string; folderScope: string[]; label: string }> {
  return call(`/companies/${companyId}/vector/tokens`, 'POST', { folderIds, label });
}

/** #307 Видалити під-токен. */
export async function deleteVectorToken(companyId: string, token: string): Promise<{ deleted: boolean }> {
  return call(`/companies/${companyId}/vector/tokens/${encodeURIComponent(token)}`, 'DELETE');
}

/** Проаналізувати підключену папку: зіставити теки з одиницями + (опц.) індексація у вектор. */
export async function analyzeDrive(companyId: string, index = true): Promise<AnalyzeReport> {
  const report = (await call(`/companies/${companyId}/analyze-drive`, 'POST', { index, author: 'пульт' })) as AnalyzeReport;
  revalidatePath(`/company/${companyId}`);
  return report;
}
