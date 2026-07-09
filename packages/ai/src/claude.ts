import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY не задано');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface CallClaudeOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Простий виклик Claude: система + один користувацький промпт → текст відповіді. */
export async function callClaude(userPrompt: string, opts: CallClaudeOptions = {}): Promise<string> {
  const model = opts.model ?? process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** Виклик Claude з очікуванням JSON-відповіді (парсить перший JSON-обʼєкт). */
export async function callClaudeJson<T = unknown>(userPrompt: string, opts: CallClaudeOptions = {}): Promise<T> {
  const text = await callClaude(userPrompt, opts);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude не повернув JSON: ' + text.slice(0, 200));
  return JSON.parse(match[0]) as T;
}
