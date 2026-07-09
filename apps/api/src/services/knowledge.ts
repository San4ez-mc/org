import { prisma } from '@platform/db';
import { embedOne, toVectorLiteral } from '@platform/ai';

export interface KnowledgeHit {
  source: string;
  content: string;
  score: number;
}

/** Семантичний пошук по базі знань (методологія орг.структури). */
export async function searchKnowledge(query: string, k = 5, minScore = 0.2): Promise<KnowledgeHit[]> {
  const vec = toVectorLiteral(await embedOne(query));
  const rows = await prisma.$queryRawUnsafe<KnowledgeHit[]>(
    `SELECT source, content, 1 - (embedding <=> $1::vector) AS score
     FROM "KnowledgeChunk"
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vec,
    k,
  );
  return rows.filter((r) => Number(r.score) >= minScore);
}

/** Зібрати релевантний методологічний контекст як текст для промпту. */
export async function knowledgeContextFor(query: string, k = 5): Promise<string> {
  const hits = await searchKnowledge(query, k).catch(() => []);
  if (!hits.length) return '';
  return hits.map((h, i) => `[${i + 1}] (${h.source})\n${h.content}`).join('\n\n');
}
