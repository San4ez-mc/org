import { prisma } from '@platform/db';
import { ensureFolder, findFolderByName, listFolderFiles } from '@platform/drive';
import { loadDriveScope } from './driveScope';

/**
 * Структура тек клієнта з описами — те, за чим асистент вирішує, КУДИ класти документ.
 *
 * Спершу тека була зашита в шаблоні документа (`03_Кандидати`), і на першому ж живому
 * клієнті це впало: таких тек у неї не було, а асистент замість документа видав текст
 * у чат і попросив створити файл руками. Структура в кожного своя, тому вона дані.
 *
 * Джерело правди — `Company.structureProposal`: там ШІ вже проставляє кожній теці
 * descUser (для людини) і descSystem (ключові слова для авто-розкладки), а власник
 * правит їх у панелі. Нової таблиці не заводимо: інакше в системі стало б два описи
 * однієї теки, і вони б розʼїхались.
 */

export interface StructureNode {
  name: string;
  path: string;
  descUser?: string;
  descSystem?: string;
  driveId?: string;
  children?: StructureNode[];
}

interface RawNode {
  name?: string;
  type?: string;
  descUser?: string;
  descSystem?: string;
  children?: RawNode[];
  [k: string]: unknown;
}

/** Шляхи → id тек, які вже реально створені на Диску (пише apply-structure). */
function appliedIds(proposal: any): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of proposal?.applyLog?.created ?? []) {
    if (row?.path && row?.id) out.set(String(row.path).replace(/^\//, ''), String(row.id));
  }
  return out;
}

function toTree(nodes: RawNode[], parentPath: string, ids: Map<string, string>): StructureNode[] {
  const out: StructureNode[] = [];
  for (const n of nodes) {
    if (!n?.name || (n.type && n.type !== 'folder')) continue;
    const path = parentPath ? `${parentPath}/${n.name}` : String(n.name);
    out.push({
      name: String(n.name),
      path,
      descUser: n.descUser || undefined,
      descSystem: n.descSystem || undefined,
      driveId: ids.get(path),
      children: Array.isArray(n.children) ? toTree(n.children, path, ids) : undefined,
    });
  }
  return out;
}

/**
 * Дерево тек із описами. Поки структуру не описано — повертаємо те, що реально
 * лежить у теці запису, і кажемо про це прямо: асистент має описати теки сам,
 * а не вигадувати, що їх немає.
 */
export async function readStructure(companyId: string): Promise<{
  source: 'structure' | 'drive';
  note: string;
  folders: StructureNode[];
}> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { structureProposal: true, driveWriteFolderId: true },
  });
  const proposal = c?.structureProposal as any;

  if (proposal?.structure?.length) {
    return {
      source: 'structure',
      note: 'Обирай теку за descSystem. Немає відповідної — створи через drive_folder_upsert з описом.',
      folders: toTree(proposal.structure, '', appliedIds(proposal)),
    };
  }

  if (!c?.driveWriteFolderId) return { source: 'drive', note: 'Тека для запису не налаштована — писати нікуди.', folders: [] };

  const files = await listFolderFiles(c.driveWriteFolderId);
  const folders = files
    .filter((f) => f.mimeType === 'application/vnd.google-apps.folder')
    .map((f) => ({ name: f.name, path: f.name, driveId: f.id }));
  return {
    source: 'drive',
    note: folders.length
      ? 'Описів тек ще немає. Коли зрозумієш, що в якій лежить, запиши через drive_folder_upsert — наступного разу обиратимеш сам.'
      : 'Тека для запису порожня. Створи потрібні теки через drive_folder_upsert з описом, замість складати все в корінь.',
    folders,
  };
}

/** Знайти вузол за назвою (реєстр і пробіли прощаємо: модель пише по-різному). */
function findNode(nodes: RawNode[], name: string): RawNode | null {
  const want = name.trim().toLowerCase();
  return nodes.find((n) => String(n?.name ?? '').trim().toLowerCase() === want) ?? null;
}

/**
 * Створити теку і/або записати її опис.
 *
 * Тека створюється ТІЛЬКИ всередині теки запису: право писати куди завгодно на диску
 * клієнта Google нам технічно дає, і єдина межа — цей код.
 */
export async function upsertFolder(
  companyId: string,
  input: { path: string; descUser?: string; descSystem?: string; create?: boolean },
): Promise<{ path: string; driveId?: string; created: boolean; descUser?: string; descSystem?: string }> {
  const parts = String(input.path || '').split('/').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Вкажи шлях теки, напр. «Кандидати» або «Клієнти/Активні»');

  const scope = await loadDriveScope(companyId);
  if (!scope.writeFolderId) throw new Error('Для компанії не налаштована тека запису');

  // Спершу Диск: якщо створення не вдасться, опис не має лишитись про неіснуючу теку.
  let parentId = scope.writeFolderId;
  let created = false;
  for (const part of parts) {
    const found = await findFolderByName(parentId, part);
    if (found) { parentId = found; continue; }
    if (input.create === false) throw new Error(`Теки «${part}» немає. Передай create=true, щоб створити.`);
    parentId = await ensureFolder(parentId, part);
    created = true;
  }

  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { structureProposal: true } });
  const proposal = (c?.structureProposal && typeof c.structureProposal === 'object')
    ? { ...(c.structureProposal as any) }
    : ({} as any);
  if (!Array.isArray(proposal.structure)) proposal.structure = [];

  // Добудовуємо гілку, якщо описів для неї ще не було.
  let level: RawNode[] = proposal.structure;
  let node: RawNode | null = null;
  for (const part of parts) {
    node = findNode(level, part);
    if (!node) {
      node = { name: part, type: 'folder', children: [], action: 'new', origin: '' };
      level.push(node);
    }
    if (!Array.isArray(node.children)) node.children = [];
    level = node.children as RawNode[];
  }
  if (node) {
    if (input.descUser !== undefined) node.descUser = String(input.descUser);
    if (input.descSystem !== undefined) node.descSystem = String(input.descSystem);
  }

  const path = parts.join('/');
  const log = Array.isArray(proposal.applyLog?.created) ? proposal.applyLog.created.slice() : [];
  if (!log.some((r: any) => r?.path === `/${path}`)) log.push({ name: parts[parts.length - 1], path: `/${path}`, id: parentId });
  proposal.applyLog = { ...(proposal.applyLog ?? {}), appliedAt: new Date().toISOString(), created: log, createdCount: log.length };

  await prisma.company.update({ where: { id: companyId }, data: { structureProposal: proposal } });
  await prisma.changeLog.create({
    data: {
      companyId,
      entity: 'structure',
      action: created ? 'create' : 'update',
      summary: created ? `Асистент створив теку «${path}»` : `Асистент описав теку «${path}»`,
      author: 'асистент',
    },
  }).catch(() => {});

  return { path, driveId: parentId, created, descUser: node?.descUser, descSystem: node?.descSystem };
}

/**
 * Тека для запису за шляхом зі структури. Помилка навмисно перелічує наявні теки:
 * модель має змогу виправитись сама, а не впертись у «відмовлено».
 */
export async function resolveFolderByPath(companyId: string, path: string): Promise<string> {
  const parts = String(path || '').split('/').map((p) => p.trim()).filter(Boolean);
  const scope = await loadDriveScope(companyId);
  if (!scope.writeFolderId) throw new Error('Для компанії не налаштована тека запису');
  if (!parts.length) return scope.writeFolderId;

  let parentId = scope.writeFolderId;
  for (const part of parts) {
    const found = await findFolderByName(parentId, part);
    if (!found) {
      const s = await readStructure(companyId);
      const names = s.folders.map((f) => f.path).join(', ') || '(тек немає)';
      throw new Error(
        `Теки «${part}» немає. Доступні: ${names}. `
        + 'Обери одну з них або створи нову через drive_folder_upsert з описом.',
      );
    }
    parentId = found;
  }
  return parentId;
}
