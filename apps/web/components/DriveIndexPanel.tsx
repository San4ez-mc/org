'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { startDriveIndex, getDriveIndexStatus, type DriveIndexStatus } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9, padding: '10px 18px',
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};

const PHASE: Record<string, string> = {
  idle: 'Не запускалась', listing: 'Читаю список файлів…', reading: 'Індексую файли…',
  done: 'Готово', error: 'Помилка',
};

function fmtEta(s: number | null): string {
  if (s == null) return '';
  if (s < 60) return `≈ ${s} с`;
  const m = Math.floor(s / 60), sec = s % 60;
  return `≈ ${m} хв${sec ? ` ${sec} с` : ''}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; }
}

export default function DriveIndexPanel({ companyId, indexedAt, indexedCount }: { companyId: string; indexedAt: string | null; indexedCount: number }) {
  const [st, setSt] = useState<DriveIndexStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState('');
  const [lastIndexedAt, setLastIndexedAt] = useState(indexedAt);
  const [lastCount, setLastCount] = useState(indexedCount);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const s = await getDriveIndexStatus(companyId);
      setSt(s);
      if (!s.running && timer.current) {
        clearInterval(timer.current); timer.current = null;
        if (s.phase === 'done') { setLastIndexedAt(new Date().toISOString()); setLastCount(s.indexed); }
      }
    } catch { /* ignore transient */ }
  }, [companyId]);

  useEffect(() => {
    poll(); // підхопити, якщо індексація вже триває (напр. після F5)
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [poll]);

  // якщо статус став running — почати опитування
  useEffect(() => {
    if (st?.running && !timer.current) timer.current = setInterval(poll, 2000);
  }, [st?.running, poll]);

  async function run() {
    setErr(''); setStarting(true);
    const r = await startDriveIndex(companyId);
    setStarting(false);
    if (!r.started) { setErr(r.error || 'Не вдалось запустити (можливо вже триває або вектор вимкнено).'); }
    await poll();
    if (!timer.current) timer.current = setInterval(poll, 2000);
  }

  const running = st?.running ?? false;
  const total = st?.total ?? 0;
  const processed = st?.processed ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const indeterminate = running && (st?.phase === 'listing' || total === 0);

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🚀 Індексація у вектор-базу</div>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', margin: '0 0 12px', lineHeight: 1.5 }}>
        Записує всі <b>невиключені</b> файли робочої папки у вектор-базу для семантичного пошуку.
        Виключені 🚫 теки/файли пропускаються. Працює у фоні — можна закрити сторінку.
      </p>

      {lastIndexedAt && !running && st?.phase !== 'done' && (
        <p style={{ fontSize: 12.5, color: 'hsl(142 40% 65%)', margin: '0 0 12px' }}>
          ✅ Остання індексація: {fmtDate(lastIndexedAt)} · файлів у вектор-базі: <b>{lastCount}</b>
        </p>
      )}

      {!running && (
        <button style={btn} onClick={run} disabled={starting}>
          {starting ? 'Запускаю…' : (lastIndexedAt ? '🔄 Переіндексувати' : '🚀 Запустити індексацію')}
        </button>
      )}

      {running && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>
            <span>{PHASE[st?.phase ?? 'reading']}</span>
            <span>{total > 0 ? `${processed} / ${total}` : ''} {st?.etaSeconds != null ? `· ${fmtEta(st.etaSeconds)}` : ''}</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'hsl(var(--muted))', overflow: 'hidden', position: 'relative' }}>
            {indeterminate ? (
              <div style={{ position: 'absolute', height: '100%', width: '40%', borderRadius: 999, background: 'hsl(var(--foreground) / 0.4)', animation: 'dip-slide 1.2s ease-in-out infinite' }} />
            ) : (
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'hsl(142 45% 45%)', transition: 'width .4s' }} />
            )}
          </div>
          <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 8 }}>
            Проіндексовано чанків: <b>{st?.indexed ?? 0}</b>. Можна не чекати — індексація триває у фоні.
          </p>
          <style>{`@keyframes dip-slide { 0%{left:-40%} 100%{left:100%} }`}</style>
        </div>
      )}

      {!running && st?.phase === 'done' && (
        <p style={{ fontSize: 13, color: 'hsl(142 45% 65%)', marginTop: 12 }}>
          ✅ Готово! Оброблено {st.processed} файлів, у вектор-базу записано <b>{st.indexed}</b> чанків.
        </p>
      )}
      {!running && st?.phase === 'error' && (
        <p style={{ fontSize: 13, color: 'hsl(0 70% 62%)', marginTop: 12 }}>❌ Помилка: {st.error}</p>
      )}
      {err && <p style={{ fontSize: 12.5, color: 'hsl(0 70% 62%)', marginTop: 10 }}>{err}</p>}
    </div>
  );
}
