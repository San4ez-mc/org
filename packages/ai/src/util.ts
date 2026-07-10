/** Розбити текст на чанки ~maxLen символів з перекриттям overlap, по абзацах. */
export function chunkText(text: string, maxLen = 1500, overlap = 200): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= maxLen) return clean ? [clean] : [];

  const paras = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = buf.slice(Math.max(0, buf.length - overlap)) + '\n\n' + p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
    // дуже довгий абзац — ріжемо жорстко
    while (buf.length > maxLen) {
      chunks.push(buf.slice(0, maxLen).trim());
      buf = buf.slice(maxLen - overlap);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/** Літерал pgvector з масиву чисел. */
export function toVectorLiteral(v: number[]): string {
  return '[' + v.join(',') + ']';
}

interface ProcStep {
  postTitle: string;
  action: string;
  result: string;
}

/** Текст Google-документа процесу: опис + кроки + Mermaid-схема потоку. */
export function processDocText(name: string, description: string, steps: ProcStep[]): string {
  const lines: string[] = [];
  lines.push(`Бізнес-процес: ${name}`, '');
  if (description) lines.push(description, '');
  lines.push('Кроки (потік частинки зліва-направо):', '');
  steps.forEach((s, i) => {
    lines.push(`${i + 1}. [${s.postTitle}] ${s.action}`);
    if (s.result) lines.push(`   → ${s.result}`);
  });
  lines.push('', '— Схема (Mermaid) —', '```mermaid', 'flowchart LR');
  steps.forEach((s, i) => {
    const label = `${s.postTitle}: ${s.action}`.replace(/"/g, "'");
    lines.push(`  s${i}["${label}"]`);
    if (i > 0) lines.push(`  s${i - 1} --> s${i}`);
  });
  lines.push('```');
  return lines.join('\n');
}
