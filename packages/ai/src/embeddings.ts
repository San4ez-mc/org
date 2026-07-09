import { readFileSync } from 'node:fs';

/**
 * Провайдер-агностичні embeddings.
 * Зараз: OpenAI text-embedding-3-small (мультимовний, без GCP).
 * Пізніше: Vertex text-embedding-004 (коли ввімкнуть Vertex у проекті proccess-org-ai-bot).
 * Перемикач: EMBEDDINGS_PROVIDER = openai | vertex.
 */
export type EmbeddingsProvider = 'openai' | 'vertex';

export function embeddingsProvider(): EmbeddingsProvider {
  return (process.env.EMBEDDINGS_PROVIDER as EmbeddingsProvider) ?? 'openai';
}

/** Розмірність вектора активного провайдера (має збігатися з колонкою pgvector). */
export function embeddingDim(): number {
  return embeddingsProvider() === 'vertex' ? 768 : Number(process.env.EMBEDDING_DIM ?? 1536);
}

async function embedOpenAI(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY не задано (для embeddings)');
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

async function embedVertex(texts: string[]): Promise<number[][]> {
  // Ліниво тягнемо googleapis лише коли обрано Vertex (щоб не тягнути залежність без потреби).
  const { google } = await import('googleapis');
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS не задано (для Vertex)');
  const creds = JSON.parse(readFileSync(keyPath, 'utf8'));
  const project = process.env.GCP_PROJECT_ID ?? creds.project_id;
  const loc = process.env.VERTEX_EMBEDDING_LOCATION ?? 'us-central1';
  const model = process.env.VERTEX_EMBEDDING_MODEL ?? 'text-embedding-004';
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const token = (await (await auth.getClient()).getAccessToken()).token;
  const url = `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/publishers/google/models/${model}:predict`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: texts.map((content) => ({ content })) }),
  });
  if (!res.ok) throw new Error(`Vertex embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { predictions: { embeddings: { values: number[] } }[] };
  return data.predictions.map((p) => p.embeddings.values);
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  return embeddingsProvider() === 'vertex' ? embedVertex(texts) : embedOpenAI(texts);
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}
