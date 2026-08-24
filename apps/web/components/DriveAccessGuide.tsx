'use client';
import { useState } from 'react';

/**
 * Майстер видачі доступу до Диска.
 *
 * Навіщо: підключення Диска — це те, що робиться раз на клієнта і щоразу забувається.
 * Тому спосіб обирається тут, а не в переписці: обрав варіант — бачиш саме ті кроки
 * і саме ті поля, які потрібні для нього. Решта прихована (progressive disclosure),
 * щоб не лякати клієнта формою на десять полів, з яких потрібні два.
 *
 * Адреси й ідентифікатори приходять із живої конфігурації сервера, не з константи —
 * інакше при зміні ключа інструкція почне вести клієнта не туди.
 */

export interface DriveConnectionInfo {
  mode: 'oauth' | 'service_account';
  serviceAccountEmail: string | null;
  oauthClientId: string | null;
}

type MethodId = 'shared-drive' | 'share-folder' | 'oauth';

interface Method {
  id: MethodId;
  title: string;
  badge?: string;
  forWhom: string;
  tradeoff: string;
}

const METHODS: Method[] = [
  {
    id: 'shared-drive',
    title: 'Спільний диск Google Workspace',
    badge: 'Рекомендовано',
    forWhom: 'Якщо у вас корпоративна пошта на власному домені (Google Workspace).',
    tradeoff: 'Файли лишаються власністю компанії, місце рахується з її сховища. Асистент може і читати, і створювати документи.',
  },
  {
    id: 'share-folder',
    title: 'Звичайний Google Диск — поділитись текою',
    forWhom: 'Якщо у вас особистий акаунт Gmail без Workspace.',
    tradeoff: 'Читання, пошук і створення тек працюють. Створювати Google-документи в такій теці робот не зможе — це обмеження Google, не наше.',
  },
  {
    id: 'oauth',
    title: 'Доступ від імені акаунта FINEKO',
    forWhom: 'Тимчасовий варіант, коли доступ потрібен просто зараз.',
    tradeoff: 'Нічого налаштовувати не треба, але доступ періодично доводиться поновлювати вручну. Як постійне рішення не підходить.',
  },
];

const card: React.CSSProperties = {
  border: '1px solid hsl(var(--border))', borderRadius: 12, padding: 14, marginBottom: 10,
  cursor: 'pointer', background: 'hsl(var(--background))',
};
const cardActive: React.CSSProperties = {
  ...card, borderColor: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.06)', cursor: 'default',
};
const badge: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
  background: 'hsl(142 45% 22%)', color: 'hsl(142 70% 82%)', marginLeft: 8,
};
const label: React.CSSProperties = { fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 4, display: 'block' };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8,
  border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'inherit', fontSize: 13,
};
const btn: React.CSSProperties = {
  background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground, 0 0% 100%))', border: 0,
  borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const stepList: React.CSSProperties = { margin: '10px 0 14px', paddingLeft: 20, fontSize: 13, lineHeight: 1.75 };

function CopyField({ value, hint }: { value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ margin: '6px 0 10px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{
          flex: 1, minWidth: 240, padding: '8px 10px', borderRadius: 8, fontSize: 12.5,
          background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', wordBreak: 'break-all',
        }}>{value}</code>
        <button
          type="button"
          style={{ ...btn, background: 'hsl(var(--foreground) / 0.10)', color: 'hsl(var(--foreground))' }}
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >{copied ? 'Скопійовано' : 'Копіювати'}</button>
      </div>
      {hint && <div style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function DriveAccessGuide({
  info, folderInput, onFolderInput, onConnect, pending,
}: {
  info: DriveConnectionInfo | null;
  folderInput: string;
  onFolderInput: (v: string) => void;
  onConnect: () => void;
  pending: boolean;
}) {
  const [chosen, setChosen] = useState<MethodId | null>(null);
  const sa = info?.serviceAccountEmail;

  // Без сервісного акаунта два перші способи фізично не спрацюють — не пропонуємо їх,
  // щоб клієнт не витрачав час на кроки, які нічого не дадуть.
  const saReady = Boolean(sa);

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Оберіть, як видати доступ</div>

      {METHODS.map((m) => {
        const active = chosen === m.id;
        const disabled = !saReady && m.id !== 'oauth';
        return (
          <div
            key={m.id}
            style={{ ...(active ? cardActive : card), opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : card.cursor }}
            onClick={() => !disabled && setChosen(m.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input type="radio" checked={active} readOnly disabled={disabled} style={{ accentColor: 'hsl(var(--primary))' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.title}</span>
              {m.badge && !disabled && <span style={badge}>{m.badge}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginTop: 6, paddingLeft: 24 }}>
              {m.forWhom}
              <div style={{ marginTop: 3 }}>{m.tradeoff}</div>
              {disabled && <div style={{ marginTop: 4, color: 'hsl(38 80% 65%)' }}>Недоступно: сервісний акаунт не налаштований на сервері.</div>}
            </div>

            {active && (
              <div style={{ paddingLeft: 24, marginTop: 12, borderTop: '1px solid hsl(var(--border))', paddingTop: 12 }}>
                {m.id === 'shared-drive' && (
                  <>
                    <ol style={stepList}>
                      <li>Відкрийте Google Диск → <b>Спільні диски</b> і створіть диск для компанії (або візьміть наявний).</li>
                      <li>Натисніть <b>Керувати учасниками</b> і додайте цю адресу з роллю <b>Автор вмісту</b>:</li>
                    </ol>
                    <CopyField value={sa!} hint="Це технічний акаунт платформи. Пошти в нього немає — сповіщення надсилати не треба." />
                    <ol start={3} style={stepList}>
                      <li>Створіть у цьому диску теку компанії й скопіюйте посилання на неї.</li>
                    </ol>
                  </>
                )}

                {m.id === 'share-folder' && (
                  <>
                    <ol style={stepList}>
                      <li>Знайдіть на Диску кореневу робочу теку компанії.</li>
                      <li>Правою кнопкою → <b>Надати доступ</b>, вставте цю адресу і виберіть роль <b>Редактор</b>:</li>
                    </ol>
                    <CopyField value={sa!} hint="Зніміть галочку «Сповістити людей» — це робот, пошти в нього немає." />
                    <ol start={3} style={stepList}>
                      <li>Скопіюйте посилання на теку.</li>
                    </ol>
                  </>
                )}

                {m.id === 'oauth' && (
                  <>
                    <ol style={stepList}>
                      <li>Поділіться текою з Google-акаунтом FINEKO (адресу дамо окремо) з роллю <b>Редактор</b>.</li>
                      <li>Скопіюйте посилання на теку.</li>
                    </ol>
                    <div style={{
                      fontSize: 12.5, padding: '9px 11px', borderRadius: 9, marginBottom: 12,
                      background: 'hsl(38 55% 14%)', border: '1px solid hsl(38 55% 28%)', color: 'hsl(38 85% 80%)',
                    }}>
                      Такий доступ Google періодично скасовує, і його доводиться поновлювати вручну.
                      Для постійної роботи краще один із варіантів вище.
                    </div>
                  </>
                )}

                <label style={label}>Посилання на теку або її ID</label>
                <input
                  value={folderInput}
                  onChange={(e) => onFolderInput(e.target.value)}
                  placeholder="drive.google.com/drive/folders/…"
                  style={input}
                  onKeyDown={(e) => e.key === 'Enter' && folderInput.trim() && onConnect()}
                />
                <button style={{ ...btn, marginTop: 10 }} onClick={onConnect} disabled={pending || !folderInput.trim()}>
                  {pending ? 'Підключаю…' : 'Підключити теку'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {info && (
        <div style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
          Поточний режим доступу платформи: <b>{info.mode === 'oauth' ? 'від імені акаунта FINEKO' : 'сервісний акаунт'}</b>
          {sa ? ` · ${sa}` : ''}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 10, lineHeight: 1.6 }}>
        Потрібен доступ до всього Диска й пошти одразу — це налаштовується окремо, через делегування
        в адмін-консолі вашого домену. Напишіть нам, підкажемо кроки.
      </div>
    </div>
  );
}
