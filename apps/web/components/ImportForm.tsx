'use client';
import { useState, useTransition, type ChangeEvent } from 'react';
import { importCsv, type ImportResult, type ImportSummary } from '@/app/company/[id]/import/actions';

const SAMPLE = `Відділ,Посада,ЦКП,Ім'я,Прізвище,email
Продажі,Менеджер з продажу,Закриті угоди,Іван,Петренко,ivan@example.com
Маркетинг,Таргетолог,Кваліфіковані ліди,Марія,Коваль,maria@example.com`;

export default function ImportForm({ companyId }: { companyId: string }) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (dryRun: boolean) => {
    setResult(null);
    startTransition(async () => {
      const r = await importCsv(companyId, csv, dryRun);
      setResult(r);
    });
  };

  const box = {
    background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
    borderRadius: 'var(--radius)', padding: '14px 16px',
  } as const;
  const btn = (primary: boolean) => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: pending ? 'default' : 'pointer',
    border: '1px solid hsl(var(--border))',
    background: primary ? 'hsl(var(--primary))' : 'transparent',
    color: primary ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
    opacity: pending ? 0.6 : 1,
  } as const);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={box}>
        <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>
          Вставте CSV із рядком-заголовком. Колонки (укр. або англ.): <code>Відділення, Відділ, Посада, ЦКП, Ім&apos;я, Прізвище, email, Телеграм</code>.
          Спершу «Перевірити» (нічого не запишеться), тоді «Імпортувати».
        </p>
        <textarea
          value={csv}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCsv(e.target.value)}
          placeholder={SAMPLE}
          spellCheck={false}
          style={{
            width: '100%', minHeight: 200, fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
            padding: 10, borderRadius: 8, border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <button type="button" style={btn(false)} disabled={pending} onClick={() => run(true)}>Перевірити</button>
          <button type="button" style={btn(true)} disabled={pending} onClick={() => run(false)}>Імпортувати</button>
          <button type="button" style={{ ...btn(false), border: 'none' }} disabled={pending} onClick={() => setCsv(SAMPLE)}>Вставити приклад</button>
          {pending ? <span style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>Обробка…</span> : null}
        </div>
      </div>

      {result && !result.ok ? (
        <div style={{ ...box, borderColor: '#e0574e' }}>
          <strong style={{ color: '#e0574e' }}>Помилка:</strong> <span style={{ fontSize: 13 }}>{result.error}</span>
        </div>
      ) : null}

      {result && result.ok ? (
        <div style={box}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
            {result.dryRun ? 'Попередній перегляд (нічого не записано)' : 'Імпорт виконано'}
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <li>Опрацьовано рядків: <b>{result.summary.rows}</b></li>
            <li>Відділень: <b>{result.summary.divisionsCreated}</b>, відділів: <b>{result.summary.departmentsCreated}</b>, посад: <b>{result.summary.postsCreated}</b></li>
            <li>Людей створено: <b>{result.summary.membersCreated}</b>, призначень на посади: <b>{result.summary.membersAssigned}</b></li>
          </ul>
          {result.summary.errors.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, color: '#e0a34e', marginBottom: 4 }}>Помилки по рядках:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>
                {result.summary.errors.slice(0, 20).map((e: ImportSummary['errors'][number]) => (
                  <li key={e.row}>рядок {e.row}: {e.error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {!result.dryRun ? (
            <a href={`/company/${companyId}/structure`} style={{ display: 'inline-block', marginTop: 10, fontSize: 13, color: 'hsl(var(--primary))', textDecoration: 'none' }}>
              → Переглянути оргструктуру
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
