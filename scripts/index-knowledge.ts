import 'dotenv/config';
import { prisma } from '@platform/db';
import { listFolderFiles, readFileText } from '@platform/drive';
import { chunkText, embed, toVectorLiteral } from '@platform/ai';

/**
 * Індексує статті по орг.структурі з теки Drive у базу знань (pgvector).
 * Ідемпотентно: перед індексацією файлу видаляє його старі чанки.
 *
 * Запуск: yarn tsx scripts/index-knowledge.ts <folderId>
 * (folderId за замовчуванням — KNOWLEDGE_FOLDER_ID з .env)
 */
async function main() {
  const folderId = process.argv[2] || process.env.KNOWLEDGE_FOLDER_ID;
  if (!folderId) throw new Error('Вкажи folderId: yarn tsx scripts/index-knowledge.ts <id>');

  const files = await listFolderFiles(folderId);
  console.log(`Знайдено файлів: ${files.length}`);

  let totalChunks = 0;
  for (const file of files) {
    const text = await readFileText(file);
    if (!text) {
      console.log(`  ∅ пропущено (не текст): ${file.name}`);
      continue;
    }
    const chunks = chunkText(text);
    if (!chunks.length) continue;

    const vectors = await embed(chunks);
    // прибрати старі чанки цього файлу
    await prisma.$executeRawUnsafe(`DELETE FROM "KnowledgeChunk" WHERE "driveFileId" = $1`, file.id);
    for (let i = 0; i < chunks.length; i++) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeChunk" (id, source, "driveFileId", "chunkNo", content, embedding, "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, now())`,
        file.name,
        file.id,
        i,
        chunks[i],
        toVectorLiteral(vectors[i]),
      );
    }
    totalChunks += chunks.length;
    console.log(`  ✓ ${file.name} — ${chunks.length} чанків`);
  }

  const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint AS count FROM "KnowledgeChunk"`);
  console.log(`\nГотово ✅ Додано ${totalChunks} чанків. Усього в базі знань: ${Number(count)}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Помилка:', err?.message ?? err);
  process.exit(1);
});
