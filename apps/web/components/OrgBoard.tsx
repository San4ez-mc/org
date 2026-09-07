'use client';
import { useRef, useState, useTransition } from 'react';
import { toPng, toSvg } from 'html-to-image';
import type { OrgUnit, Member, Statistic } from '@/lib/api';
import { updateOrgUnit, addPost, deleteUnit, moveUnit } from '@/app/company/[id]/actions';

// #214 Міні-графік тренду статистики на картці одиниці.
function Sparkline({ stat }: { stat: Statistic }) {
  const pts = (stat.points || []).filter((p) => typeof p.value === 'number');
  if (pts.length < 2) return null;
  const w = 84, h = 22, pad = 2;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const coords = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.value - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = vals[vals.length - 1] >= vals[0];
  const good = up === stat.higherIsBetter;
  const color = good ? '#6bbf72' : '#e07a7a';
  const last = pts[pts.length - 1].value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }} title={`${stat.name}: ${last}${stat.unit ? ' ' + stat.unit : ''}`}>
      <svg width={w} height={h} style={{ flex: '0 0 auto' }}>
        <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]} r={2} fill={color} />
      </svg>
      <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {stat.name}: <b style={{ color }}>{last}{stat.unit ? ` ${stat.unit}` : ''}</b>
      </span>
    </div>
  );
}

const DIVISION_PAEI: Record<number, 'P' | 'A' | 'E' | 'I'> = { 7: 'E', 1: 'I', 2: 'E', 3: 'A', 4: 'P', 5: 'A', 6: 'I' };
const BOARD_ORDER = [7, 1, 2, 3, 4, 5, 6];
const PAEI_COLOR: Record<string, string> = { P: '#e07a7a', A: '#7a93d6', E: '#6bbf72', I: '#d6b84f' };

// Верхівка борду однакова для всіх компаній: рада засновників тримає
// адміністративне відділення, виконавчий директор — решту через трьох заступників.
const COUNCIL = { name: 'Рада засновників', divisions: [7] };
const CEO = { name: 'Виконавчий директор' };
const DEPUTIES = [
  { key: 'adm', name: 'Заступник з адміністративних питань', divisions: [1, 2, 3] },
  { key: 'tech', name: 'Заступник з технічних питань', divisions: [4, 5] },
  { key: 'public', name: 'Заступник по роботі з публікою', divisions: [6] },
];

// Геометрія колонок. Лінії малюємо в SVG за обчисленими центрами: підганяти
// з'єднання псевдоелементами на вкладених флексах — це щоразу нова халепа
// при зміні висоти картки, а тут координати не залежать від вмісту.
const COL_W = 250;
const COL_GAP = 14;
const BOARD_W = BOARD_ORDER.length * COL_W + (BOARD_ORDER.length - 1) * COL_GAP;
const colX = (i: number) => i * (COL_W + COL_GAP) + COL_W / 2;
const colOf = (boardNo: number) => BOARD_ORDER.indexOf(boardNo);
/** Центр групи колонок — над ними стоїть керівник. */
const groupX = (nos: number[]) => {
  const xs = nos.map((n) => colX(colOf(n))).filter((x) => x >= COL_W / 2);
  return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
};

const LINE = 'hsl(var(--border))';

/** Вертикальний відрізок від keeper вниз і горизонтальна планка до дітей. */
function Connectors({ from, to, height }: { from: number; to: number[]; height: number }) {
  if (!to.length) return null;
  const mid = height / 2;
  const left = Math.min(from, ...to);
  const right = Math.max(from, ...to);
  return (
    <svg width={BOARD_W} height={height} style={{ display: 'block' }}>
      <line x1={from} y1={0} x2={from} y2={mid} stroke={LINE} strokeWidth={1.5} />
      {to.length > 1 || to[0] !== from ? (
        <line x1={left} y1={mid} x2={right} y2={mid} stroke={LINE} strokeWidth={1.5} />
      ) : null}
      {to.map((x) => <line key={x} x1={x} y1={mid} x2={x} y2={height} stroke={LINE} strokeWidth={1.5} />)}
    </svg>
  );
}

/** Коробка керівника, поставлена по центру своєї групи колонок. */
function Chief({ x, name, holder }: { x: number; name: string; holder?: string }) {
  const w = 230;
  return (
    <div
      style={{
        position: 'absolute', left: x - w / 2, width: w, boxSizing: 'border-box',
        background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
        borderRadius: 8, padding: '7px 10px', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{name}</div>
      {holder && <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{holder}</div>}
    </div>
  );
}

export default function OrgBoard({ units, members, companyId, statistics = [], companyCkp }: { units: OrgUnit[]; members: Member[]; companyId: string; statistics?: Statistic[]; companyCkp?: string | null }) {
  // статистики за одиницею (перша на одиницю — для sparkline на картці)
  const statOf = (unitId: string) => statistics.find((s) => s.orgUnitId === unitId);
  const [scale, setScale] = useState(1);
  const [showPeople, setShowPeople] = useState(true);
  const boardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // #218 Drag&drop: перенесення посади в інший підрозділ.
  const [draggedPost, setDraggedPost] = useState<{ id: string; parentId: string | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [, startMove] = useTransition();

  function dropProps(targetId: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (draggedPost && draggedPost.parentId !== targetId) { e.preventDefault(); setDropTarget(targetId); }
      },
      onDragLeave: () => setDropTarget((t) => (t === targetId ? null : t)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const dp = draggedPost;
        setDropTarget(null);
        setDraggedPost(null);
        if (dp && dp.parentId !== targetId) startMove(() => moveUnit(companyId, dp.id, targetId));
      },
    };
  }

  // #201 Експорт борду у PNG/SVG (клієнтський — з реального DOM зі стилями).
  async function exportBoard(kind: 'png' | 'svg') {
    const node = boardRef.current;
    if (!node) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || '#0d1117';
      const opts = { backgroundColor: bg, cacheBust: true, pixelRatio: 2 };
      const dataUrl = kind === 'png' ? await toPng(node, opts) : await toSvg(node, opts);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `org-structure.${kind}`;
      a.click();
    } catch (e) {
      alert('Не вдалося експортувати: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const divisions = units.filter((u) => u.type === 'DIVISION');
  const byBoard = (n: number) => divisions.find((d) => d.boardNo === n);
  const childrenOf = (id: string, t: OrgUnit['type']) => units.filter((u) => u.parentId === id && u.type === t);

  // Люди на посаді
  const peopleOf = (postId: string): string[] =>
    members.filter((m) => m.posts.some((p) => p.postUnitId === postId)).map((m) => `${m.firstName} ${m.lastName ?? ''}`.trim());

  const admin = byBoard(7);
  const leadership = admin ? childrenOf(admin.id, 'POST') : [];

  const btn = { width: 30, height: 30, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: 16 } as const;

  const PostChip = ({ p }: { p: OrgUnit }) => {
    const people = peopleOf(p.id);
    const [, startDel] = useTransition();
    return (
      <div
        draggable
        onDragStart={() => setDraggedPost({ id: p.id, parentId: p.parentId ?? null })}
        onDragEnd={() => { setDraggedPost(null); setDropTarget(null); }}
        title="Перетягни в інший підрозділ"
        style={{ fontSize: 11.5, background: 'hsl(var(--muted))', borderRadius: 6, padding: '3px 7px', marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 6, cursor: 'grab', opacity: draggedPost?.id === p.id ? 0.4 : 1 }}
      >
        <span>
          {p.name}
          {showPeople && <span style={{ color: 'hsl(var(--muted-foreground))' }}> · {people.length ? people.join(', ') : 'вакансія'}</span>}
        </span>
        <button
          title="Видалити посаду"
          onClick={() => { if (confirm(`Видалити посаду «${p.name}»?`)) startDel(() => deleteUnit(companyId, p.id)); }}
          style={{ background: 'none', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    );
  };

  const AddPost = ({ parentId }: { parentId: string }) => {
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [, startAdd] = useTransition();
    if (!adding) return <button onClick={() => setAdding(true)} style={{ background: 'none', border: '1px dashed hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 6, padding: '3px 7px', fontSize: 11, cursor: 'pointer', width: '100%', marginTop: 2 }}>+ посада</button>;
    return (
      <input
        autoFocus
        value={name}
        placeholder="Назва посади"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setAdding(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { startAdd(() => addPost(companyId, parentId, name.trim())); setName(''); setAdding(false); } if (e.key === 'Escape') setAdding(false); }}
        style={{ fontSize: 11.5, background: 'hsl(var(--background))', border: '1px solid hsl(var(--primary))', borderRadius: 6, padding: '3px 6px', width: '100%', marginTop: 2 }}
      />
    );
  };

  return (
    <div>
      {/* Панель інструментів */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)))} title="Зменшити">−</button>
        <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', width: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button style={btn} onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} title="Збільшити">+</button>
        <button style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: 12 }} onClick={() => setScale(1)}>Скинути</button>
        <button style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: 12 }} disabled={exporting} onClick={() => exportBoard('png')} title="Експорт у PNG">{exporting ? '…' : 'PNG'}</button>
        <button style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: 12 }} disabled={exporting} onClick={() => exportBoard('svg')} title="Експорт у SVG">SVG</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPeople} onChange={(e) => setShowPeople(e.target.checked)} /> показувати людей
        </label>

        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {([['P', 'Виробник'], ['A', 'Адміністратор'], ['E', 'Підприємець'], ['I', 'Інтегратор']] as const).map(([r, n]) => (
            <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: PAEI_COLOR[r] }} /> {r} · {n}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflow: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', background: 'hsl(var(--background))', padding: 16 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content', transition: 'transform 0.12s' }}>
          <div ref={boardRef} style={{ width: 'max-content', background: 'hsl(var(--background))', padding: 4 }}>
          {/* ── Верхівка: рада засновників і виконавчий директор ── */}
          <div style={{ position: 'relative', width: BOARD_W, height: 46 }}>
            <Chief x={groupX(COUNCIL.divisions)} name={COUNCIL.name} />
            <Chief
              x={groupX(DEPUTIES.flatMap((d) => d.divisions))}
              name={CEO.name}
              holder={showPeople && leadership[0] ? peopleOf(leadership[0].id)[0] : undefined}
            />
          </div>

          {/* Директор → заступники. Рада засновників іде вниз своєю лінією. */}
          <Connectors
            from={groupX(DEPUTIES.flatMap((d) => d.divisions))}
            to={DEPUTIES.map((d) => groupX(d.divisions))}
            height={22}
          />

          <div style={{ position: 'relative', width: BOARD_W, height: 46 }}>
            {DEPUTIES.map((d) => <Chief key={d.key} x={groupX(d.divisions)} name={d.name} />)}
          </div>

          {/* Заступники і рада → свої відділення */}
          <svg width={BOARD_W} height={22} style={{ display: 'block' }}>
            {[{ from: groupX(COUNCIL.divisions), to: COUNCIL.divisions },
              ...DEPUTIES.map((d) => ({ from: groupX(d.divisions), to: d.divisions }))]
              .map(({ from, to }) => {
                const xs = to.map((n) => colX(colOf(n)));
                return (
                  <g key={from}>
                    <line x1={from} y1={0} x2={from} y2={11} stroke={LINE} strokeWidth={1.5} />
                    <line x1={Math.min(from, ...xs)} y1={11} x2={Math.max(from, ...xs)} y2={11} stroke={LINE} strokeWidth={1.5} />
                    {xs.map((x) => <line key={x} x1={x} y1={11} x2={x} y2={22} stroke={LINE} strokeWidth={1.5} />)}
                  </g>
                );
              })}
          </svg>

          <div style={{ display: 'flex', gap: COL_GAP, alignItems: 'stretch', width: BOARD_W }}>
            {BOARD_ORDER.map((n) => {
              const d = byBoard(n);
              if (!d) return null;
              const role = DIVISION_PAEI[n];
              const depts = childrenOf(d.id, 'DEPARTMENT');
              const posts = childrenOf(d.id, 'POST');
              return (
                <div key={d.id} style={{ width: COL_W, flex: `0 0 ${COL_W}px`, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, borderTop: `3px solid ${PAEI_COLOR[role]}`, padding: 12, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Editable companyId={companyId} unitId={d.id} field="name" value={`${n}. ${d.name}`} bold />
                    <span className={`paei-${role}`} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5 }}>{role}</span>
                  </div>
                  {statOf(d.id) && <Sparkline stat={statOf(d.id)!} />}

                  {/* Відділи висять на спині відділення — видно, що вони його частина,
                      а не просто лежать поруч у тій самій картці. */}
                  <div style={{ position: 'relative', marginTop: depts.length ? 10 : 0 }}>
                    {depts.length > 0 && (
                      <div style={{ position: 'absolute', left: 7, top: -10, bottom: 20, width: 1.5, background: LINE }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {depts.map((dep) => {
                        const dPosts = childrenOf(dep.id, 'POST');
                        return (
                          <div key={dep.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
                            <div style={{ width: 16, height: 1.5, background: LINE, marginTop: 13, flex: '0 0 16px' }} />
                            <div {...dropProps(dep.id)} style={{ flex: 1, minWidth: 0, background: 'hsl(var(--background))', border: `1px solid ${dropTarget === dep.id ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`, boxShadow: dropTarget === dep.id ? '0 0 0 1px hsl(var(--primary))' : 'none', borderRadius: 8, padding: 8 }}>
                              <Editable companyId={companyId} unitId={dep.id} field="name" value={dep.name} />
                              <Editable companyId={companyId} unitId={dep.id} field="ckp" value={dep.ckp ?? ''} prefix="ЦКП: " small />
                              {statOf(dep.id) && <Sparkline stat={statOf(dep.id)!} />}
                              <div style={{ marginTop: 4 }}>
                                {dPosts.map((p) => <PostChip key={p.id} p={p} />)}
                                <AddPost parentId={dep.id} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div {...dropProps(d.id)} style={{ marginTop: 10, borderRadius: 8, padding: dropTarget === d.id ? 6 : 0, border: dropTarget === d.id ? '1px solid hsl(var(--primary))' : '1px solid transparent' }}>
                    {posts.length > 0 && <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Посади:</div>}
                    {posts.map((p) => <PostChip key={p.id} p={p} />)}
                    <AddPost parentId={d.id} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Смуга ЦКП відділень ──────────────────────────────────────────
              На плакатах Висоцького ЦКП стоїть окремим рядом під колонками, а не
              дрібним текстом усередині. Так його видно як обіцянку відділення,
              і порожній ЦКП одразу впадає в око. */}
          <div style={{ display: 'flex', gap: COL_GAP, alignItems: 'stretch', width: BOARD_W, marginTop: 10 }}>
            {BOARD_ORDER.map((n) => {
              const d = byBoard(n);
              if (!d) return <div key={n} style={{ width: COL_W, flex: `0 0 ${COL_W}px` }} />;
              return (
                <div
                  key={d.id}
                  style={{
                    width: COL_W, flex: `0 0 ${COL_W}px`, boxSizing: 'border-box',
                    background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                    borderTop: `2px solid ${PAEI_COLOR[DIVISION_PAEI[n]]}`, borderRadius: 8, padding: '8px 10px',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', letterSpacing: '0.04em', marginBottom: 2 }}>
                    ЦКП ВІДДІЛЕННЯ
                  </div>
                  <Editable companyId={companyId} unitId={d.id} field="ckp" value={d.ckp ?? ''} />
                </div>
              );
            })}
          </div>

          <div
            style={{
              width: BOARD_W, boxSizing: 'border-box', marginTop: 10,
              background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
              borderRadius: 8, padding: '10px 14px', textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', letterSpacing: '0.04em' }}>ЦКП КОМПАНІЇ: </span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>
              {companyCkp || <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>не заповнено — асистент запише його після знайомства</span>}
            </span>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Editable({ companyId, unitId, field, value, bold, small, prefix }: { companyId: string; unitId: string; field: 'name' | 'ckp'; value: string; bold?: boolean; small?: boolean; prefix?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [pending, start] = useTransition();

  const save = () => {
    setEditing(false);
    // для name прибираємо префікс "N. " якщо був
    const clean = field === 'name' ? val.replace(/^\d+\.\s*/, '') : val;
    if (clean !== value.replace(/^\d+\.\s*/, '')) start(() => updateOrgUnit(companyId, unitId, { [field]: clean }));
  };

  const base = { fontSize: bold ? 13 : small ? 10.5 : 12, fontWeight: bold ? 700 : small ? 400 : 500, color: small ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' } as const;

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        disabled={pending}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value); setEditing(false); } }}
        style={{ ...base, background: 'hsl(var(--background))', border: '1px solid hsl(var(--primary))', borderRadius: 5, padding: '2px 5px', width: '95%' }}
      />
    );
  }
  return (
    <div onClick={() => { setVal(value); setEditing(true); }} title="Клікни, щоб редагувати" style={{ ...base, cursor: 'text', margin: small ? '2px 0 0' : 0 }}>
      {prefix}{value || <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>}
    </div>
  );
}
