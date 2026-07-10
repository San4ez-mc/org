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

/** Детермінований swimlane-Mermaid з лінійних кроків (fallback, якщо ШІ не дав діаграму). */
export function stepsToMermaid(steps: ProcStep[]): string {
  if (!steps.length) return 'flowchart TD\n  empty["Немає кроків"]';
  const lanes = new Map<string, string[]>();
  const lines: string[] = ['flowchart TD'];
  const idOf = (i: number) => `s${i}`;
  steps.forEach((s, i) => {
    const lane = s.postTitle || 'Виконавець';
    const label = `${s.action}`.replace(/["\n]/g, ' ').slice(0, 80);
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane)!.push(`    ${idOf(i)}["${label}"]`);
  });
  let li = 0;
  for (const [lane, nodes] of lanes) {
    lines.push(`  subgraph L${li++}["${lane.replace(/"/g, '')}"]`, ...nodes, '  end');
  }
  for (let i = 1; i < steps.length; i++) lines.push(`  ${idOf(i - 1)} --> ${idOf(i)}`);
  return lines.join('\n');
}

/** Текст Google-документа процесу: опис + кроки + Mermaid-схема потоку. */
export function processDocText(name: string, description: string, steps: ProcStep[], mermaid?: string): string {
  const lines: string[] = [];
  lines.push(`Бізнес-процес: ${name}`, '');
  if (description) lines.push(description, '');
  lines.push('Кроки (потік частинки зліва-направо):', '');
  steps.forEach((s, i) => {
    lines.push(`${i + 1}. [${s.postTitle}] ${s.action}`);
    if (s.result) lines.push(`   → ${s.result}`);
  });
  lines.push('', '— Swimlane-схема (Mermaid) —', '```mermaid', (mermaid && mermaid.trim()) || stepsToMermaid(steps), '```');
  return lines.join('\n');
}
