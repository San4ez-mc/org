'use client';
import { useEffect, useState, useCallback } from 'react';
import { getInstructionsFolder, setInstructionsFolder, setInstructionsFolderCentral, type InstructionsFolderInfo } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const muted: React.CSSProperties = { color: 'hsl(var(--muted-foreground))', fontSize: 12.5 };
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

export default function InstructionsFolderPanel({ companyId }: { companyId: string }) {
  const [info, setInfo] = useState<InstructionsFolderInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setInfo(await getInstructionsFolder(companyId)); } catch (e) { setErr((e as Error).message); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  async function pick(folderId?: string, create?: boolean) {
    setBusy(true); setErr('');
    try { await setInstructionsFolder(companyId, create ? { create: true, name: 'Посадові інструкції' } : { folderId }); await load(); }
    catch (e) { setErr('Не вдалось: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function createCentral() {
    setBusy(true); setErr('');
    try { await setInstructionsFolderCentral(companyId); await load(); }
    catch (e) { setErr('Не вдалось: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  const current = info?.current;
  const curName = info?.suggestions.find((s) => s.id === current)?.name;

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>📝 Папка для посадових інструкцій</div>
      <p style={{ ...muted, margin: '0 0 10px', lineHeight: 1.5 }}>
        Признач теку, куди система <b>записуватиме</b> посадові інструкції. Рекомендовано — <b>централізовано</b>:
        всі інструкції зберігаються в одному місці («1. Відділення побудови → Посадові інструкції»), а в папки окремих
        працівників потрапляють <b>ярликами</b> (не копіями). Це завершує етап налаштування папки.
      </p>

      {/* Кнопка створення прибрана: вона будувала стару модель («Посадові інструкції»
          з сімома департаментами всередині). Тепер структуру розгортає «Розгорнути
          базовий скелет» у блоці доступів вище — за погодженим шаблоном і лише в теці
          запису. Лишати обидві означало б два різні дерева на одному диску. */}
      <div style={{ ...muted, background: 'hsl(210 30% 14%)', border: '1px solid hsl(210 30% 26%)', borderRadius: 10, padding: 10, marginBottom: 12, lineHeight: 1.5 }}>
        Теку інструкцій створює <b>«🏗 Розгорнути базовий скелет»</b> у блоці «Що дозволено асистенту» вище —
        разом з рештою структури. Тут її лишається тільки <b>обрати</b>.
      </div>

      {current ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'hsl(142 45% 65%)' }}>✅ Обрано:</span>
          <a href={`https://drive.google.com/drive/folders/${current}`} target="_blank" style={{ fontSize: 13, color: 'hsl(var(--primary))' }}>{curName || current.slice(0, 16) + '…'}</a>
          <span style={muted}>· змінити нижче</span>
        </div>
      ) : (
        <p style={{ ...muted, marginBottom: 8 }}>Ще не обрано.</p>
      )}

      {info && (
        <div style={{ marginTop: 10 }}>
          {info.suggestions.length > 0 && (
            <>
              <div style={{ ...muted, marginBottom: 6 }}>Знайдені відповідні теки:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {info.suggestions.map((s) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span>📁</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.path}>{s.name}<span style={muted}> {s.path}</span></span>
                    {current === s.id ? <span style={{ ...muted, color: 'hsl(142 45% 65%)' }}>обрано</span>
                      : <button style={{ ...btn, padding: '4px 10px', fontSize: 12 }} onClick={() => pick(s.id)} disabled={busy}>обрати</button>}
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <button style={btn} onClick={() => pick(undefined, true)} disabled={busy}>
              {busy ? '…' : '➕ Створити теку «Посадові інструкції» в корені'}
            </button>
          </div>
        </div>
      )}
      {err && <p style={{ color: 'hsl(0 70% 62%)', fontSize: 12.5, marginTop: 8 }}>{err}</p>}
    </div>
  );
}
