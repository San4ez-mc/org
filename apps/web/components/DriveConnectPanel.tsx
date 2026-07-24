'use client';
import { useState, useTransition } from 'react';
import { connectDriveFolder, analyzeDrive } from '@/app/company/[id]/actions';
import type { AnalyzeReport } from '@/lib/drive-types';
import DriveTree from './DriveTree';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const btn: React.CSSProperties = {
  background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
  border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13.5, cursor: 'pointer',
};
const secBtn: React.CSSProperties = { ...btn, background: 'transparent', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))' };

export default function DriveConnectPanel({ companyId, driveRootFolderId }: { companyId: string; driveRootFolderId: string | null }) {
  const [connected, setConnected] = useState<string | null>(driveRootFolderId);
  const [input, setInput] = useState('');
  const [index, setIndex] = useState(true);
  const [report, setReport] = useState<AnalyzeReport | null>(null);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'analyzing'>('idle');

  function doConnect() {
    setErr('');
    setPhase('connecting');
    start(async () => {
      try {
        const { folderId } = await connectDriveFolder(companyId, input);
        setConnected(folderId);
        setInput('');
      } catch (e) { setErr((e as Error).message); }
      finally { setPhase('idle'); }
    });
  }

  function doAnalyze() {
    setErr('');
    setPhase('analyzing');
    start(async () => {
      try {
        const r = await analyzeDrive(companyId, index);
        setReport(r);
      } catch (e) { setErr('Аналіз не вдався: ' + (e as Error).message + ' (перевір, чи авторизовано Google Drive)'); }
      finally { setPhase('idle'); }
    });
  }

  function disconnect() {
    setPhase('connecting');
    start(async () => {
      try { await connectDriveFolder(companyId, ''); setConnected(null); setReport(null); }
      catch (e) { setErr((e as Error).message); }
      finally { setPhase('idle'); }
    });
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>📂 Google Drive: структура папок компанії</div>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px' }}>
        Підключи кореневу папку компанії на Диску — система зіставить теки з орг-структурою й (за бажанням) проіндексує всі файли у вектор-базу для семантичного пошуку.
      </p>

      {!connected ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="drive.google.com/drive/folders/…  або id папки"
            style={{ flex: 1, minWidth: 260, padding: '8px 10px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'inherit', fontSize: 13 }}
            onKeyDown={(e) => e.key === 'Enter' && doConnect()}
          />
          <button style={btn} onClick={doConnect} disabled={pending || !input.trim()}>
            {phase === 'connecting' ? 'Підключаю…' : 'Підключити'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <a href={`https://drive.google.com/drive/folders/${connected}`} target="_blank" style={{ fontSize: 13, color: 'hsl(var(--primary))' }}>
            ✅ Підключено: {connected.slice(0, 12)}…
          </a>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, color: 'hsl(var(--muted-foreground))' }}>
            <input type="checkbox" checked={index} onChange={(e) => setIndex(e.target.checked)} /> індексувати файли у вектор-базу
          </label>
          <button style={btn} onClick={doAnalyze} disabled={pending}>
            {phase === 'analyzing' ? 'Аналізую…' : '🔍 Проаналізувати папку'}
          </button>
          <button style={secBtn} onClick={disconnect} disabled={pending}>Відв'язати</button>
        </div>
      )}

      {err && <p style={{ color: 'hsl(var(--destructive, 0 70% 55%))', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

      {report && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <Chip label="✅ звʼязано" value={report.summary.linked} tone="ok" />
            <Chip label="✏️ перейменувати?" value={report.summary.renameSuggestions} tone={report.summary.renameSuggestions ? 'warn' : 'muted'} />
            <Chip label="➕ створити" value={report.summary.createSuggestions} tone={report.summary.createSuggestions ? 'warn' : 'muted'} />
            <Chip label="❓ зайві теки" value={report.summary.extraFolders} tone={report.summary.extraFolders ? 'warn' : 'muted'} />
            <Chip label="📄 інструкцій" value={report.summary.instructionDocs} tone="muted" />
            <Chip label="🔎 у вектор-базі" value={report.summary.indexedFiles} tone={report.summary.indexedFiles ? 'ok' : 'muted'} />
          </div>
          {report.structureNote === 'no-org-structure' && report.structureHint && (
            <div style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, background: 'hsl(38 60% 15%)', border: '1px solid hsl(38 60% 30%)', color: 'hsl(38 90% 82%)', fontSize: 12.5, lineHeight: 1.5 }}>
              ⚠️ {report.structureHint}
            </div>
          )}
          <p style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px' }}>
            Це <b>чернетка плану</b> — нічого на Диску не змінено. Перейменування/переміщення застосуємо лише після твого підтвердження кожної зміни.
          </p>
          {report.indexSkippedReason && (
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: -4 }}>Індексацію пропущено: {report.indexSkippedReason}</p>
          )}

          {report.changePlan.renameSuggestions.length > 0 && (
            <Section title={`✏️ Перейменувати / звʼязати (${report.changePlan.renameSuggestions.length})`} open>
              {report.changePlan.renameSuggestions.map((r) => (
                <li key={r.folderId}>
                  «{r.folder}» → <b>{r.canonicalName}</b> <span style={{ color: 'hsl(var(--muted-foreground))' }}>(схожість {Math.round(r.score * 100)}%)</span>
                </li>
              ))}
            </Section>
          )}
          {report.changePlan.createSuggestions.length > 0 && (
            <Section title={`➕ Орг-одиниці без папки (${report.changePlan.createSuggestions.length})`}>
              {report.changePlan.createSuggestions.map((u) => <li key={u.id}>{u.name} <span style={{ color: 'hsl(var(--muted-foreground))' }}>({u.type})</span></li>)}
            </Section>
          )}
          {report.changePlan.extraFolders.length > 0 && (
            <Section title={`❓ Теки поза структурою (${report.changePlan.extraFolders.length})`}>
              {report.changePlan.extraFolders.map((f) => (
                <li key={f.folderId}>
                  {f.path}
                  {f.bestGuess && <span style={{ color: 'hsl(var(--muted-foreground))' }}> — можливо «{f.bestGuess}» ({Math.round((f.bestScore ?? 0) * 100)}%)</span>}
                </li>
              ))}
            </Section>
          )}
          {report.changePlan.linked.length > 0 && (
            <Section title={`✅ Звʼязано автоматично (${report.changePlan.linked.length})`}>
              {report.changePlan.linked.map((l) => <li key={l.folderId}>«{l.folder}» ↔ {l.unit}</li>)}
            </Section>
          )}

          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Дерево Диску (як є)</div>
          <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 8 }}>
            <DriveTree nodes={report.tree} />
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'muted' }) {
  const bg = tone === 'ok' ? 'hsl(142 40% 20%)' : tone === 'warn' ? 'hsl(38 50% 22%)' : 'hsl(var(--muted))';
  const fg = tone === 'muted' ? 'hsl(var(--muted-foreground))' : 'hsl(0 0% 95%)';
  return (
    <div style={{ background: bg, color: fg, borderRadius: 8, padding: '6px 12px', fontSize: 12.5 }}>
      <b style={{ fontSize: 15 }}>{value}</b> {label}
    </div>
  );
}

function Section({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>{title}</summary>
      <ul style={{ fontSize: 12.5, color: 'hsl(var(--foreground))', margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>{children}</ul>
    </details>
  );
}
