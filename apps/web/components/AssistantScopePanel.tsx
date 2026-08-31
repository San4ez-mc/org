'use client';
import { useState, useTransition } from 'react';
import { createDriveWriteFolder, saveAssistantScope } from '@/app/company/[id]/actions';

const card: React.CSSProperties = {
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)', padding: 16, margin: '16px 0',
};
const btn: React.CSSProperties = {
  background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))', borderRadius: 9,
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8,
  border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
};
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 };
const hint: React.CSSProperties = { fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: '4px 0 0' };

/**
 * Області роботи асистента з Диском клієнта.
 *
 * Розділено навмисно: клієнт часто готовий дати боту читати весь диск, але хоче,
 * щоб змінював той лише в одній теці. Коли бот працює від імені клієнта, Google
 * його вже нічим не обмежує — межу тримає сервер за цими полями.
 */
export default function AssistantScopePanel({
  companyId, companyName, scanFolderId, writeFolderId, writableFolders,
}: {
  companyId: string;
  companyName?: string;
  scanFolderId: string | null;
  writeFolderId: string | null;
  writableFolders: string[];
}) {
  const [scan, setScan] = useState(scanFolderId ?? '');
  const [write, setWrite] = useState(writeFolderId ?? '');
  const [folders, setFolders] = useState((writableFolders ?? []).join(', '));
  const [newName, setNewName] = useState(`${companyName ?? 'Компанія'} — структура`);
  const [createdUrl, setCreatedUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  // Окремий перехід під створення теки — інакше кнопка «Зберегти» блимала б «Зберігаю…»
  // тоді, коли насправді створюється тека.
  const [creating, startCreate] = useTransition();

  function save() {
    setErr(''); setSaved(false);
    start(async () => {
      try {
        await saveAssistantScope(companyId, {
          scanInput: scan,
          writeInput: write,
          writableFolders: folders.split(',').map((s) => s.trim()).filter(Boolean),
        });
        setSaved(true);
      } catch (e) { setErr((e as Error).message); }
    });
  }

  function createWriteFolder() {
    setErr(''); setSaved(false); setCreatedUrl('');
    startCreate(async () => {
      try {
        const r = await createDriveWriteFolder(companyId, newName);
        // Підставляємо id одразу: інакше людина натисне «Створити» і побачить порожнє
        // поле, ніби нічого не сталося, — і піде шукати теку руками.
        setWrite(r.folderId);
        setCreatedUrl(r.url);
      } catch (e) { setErr((e as Error).message); }
    });
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🤖 Що дозволено асистенту</div>
      <p style={{ ...hint, margin: '0 0 14px' }}>
        Читання і запис налаштовуються окремо. Це єдине місце, яке обмежує бота: коли він
        працює від імені клієнта, Google доступ не звужує.
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={label}>Тека для читання й пошуку</label>
          <input style={input} value={scan} onChange={(e) => setScan(e.target.value)}
            placeholder="Посилання на теку або id — порожньо означає весь диск" />
          <p style={hint}>
            {scan.trim()
              ? 'Бот шукає й читає лише в цій теці та її підтеках.'
              : '⚠️ Порожньо — бот бачить увесь диск клієнта. Це нормально, якщо так домовлено.'}
          </p>
        </div>

        <div>
          <label style={label}>Тека для запису</label>
          <input style={input} value={write} onChange={(e) => setWrite(e.target.value)}
            placeholder="Посилання на теку або id — порожньо означає заборону запису" />
          <p style={hint}>
            {write.trim()
              ? 'Створювати й змінювати файли бот може лише тут.'
              : 'Порожньо — запис вимкнений, бот працює лише на читання. Створення структури папок не спрацює, поки тека не вказана.'}
          </p>

          {/* Теку зручніше створити звідси, ніж шукати руками на диску клієнта. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input style={{ ...input, flex: '1 1 220px', width: 'auto' }} value={newName}
              onChange={(e) => setNewName(e.target.value)} placeholder="Назва нової теки" />
            <button style={btn} onClick={createWriteFolder} disabled={creating || !newName.trim()}>
              {creating ? 'Створюю…' : 'Створити теку для запису'}
            </button>
          </div>
          <p style={hint}>
            {createdUrl
              ? <>✅ Теку створено й одразу записано в налаштування компанії. {' '}
                <a href={createdUrl} target="_blank" rel="noreferrer" style={{ color: 'hsl(var(--primary))' }}>Відкрити теку ↗</a></>
              : 'Тека створиться в корені підключеної папки клієнта й одразу стане текою запису.'}
          </p>
        </div>

        <div>
          <label style={label}>Дозволені підтеки для запису</label>
          <input style={input} value={folders} onChange={(e) => setFolders(e.target.value)}
            placeholder="Напр.: 02_, 03_, 04_, 05_ — порожньо означає всю теку запису" />
          <p style={hint}>
            Через кому, звіряється за початком назви. Дає змогу лишити частину тек
            (напр. базу знань) тільки для читання.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button style={btn} onClick={save} disabled={pending}>
          {pending ? 'Зберігаю…' : 'Зберегти'}
        </button>
        {saved && <span style={{ fontSize: 12.5, color: 'hsl(var(--primary))' }}>✅ Збережено</span>}
        {err && <span style={{ fontSize: 12.5, color: 'hsl(var(--destructive))' }}>{err}</span>}
      </div>
    </div>
  );
}
