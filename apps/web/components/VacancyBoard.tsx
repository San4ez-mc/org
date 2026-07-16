'use client';
import { useState, useTransition } from 'react';
import type { Vacancy, Candidate, CandidateStage } from '@/lib/api';
import { addCandidate, updateCandidate, deleteCandidate, updateVacancy, deleteVacancy } from '@/app/company/[id]/actions';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const inp = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: '6px 9px', color: 'inherit', fontSize: 12.5 } as const;
const btn = { background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' } as const;
const ghost = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 7, padding: '4px 9px', fontSize: 11.5, cursor: 'pointer' } as const;

const STAGES: { key: CandidateStage; label: string }[] = [
  { key: 'NEW', label: 'Нові' },
  { key: 'SCREENING', label: 'Скринінг' },
  { key: 'INTERVIEW', label: 'Співбесіда' },
  { key: 'OFFER', label: 'Оффер' },
  { key: 'HIRED', label: 'Найнято' },
  { key: 'REJECTED', label: 'Відмова' },
];

export default function VacancyBoard({ companyId, vacancy }: { companyId: string; vacancy: Vacancy }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(vacancy.status);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{vacancy.title}</h2>
          {vacancy.postUnit ? <p style={{ ...muted, fontSize: 12.5, margin: '4px 0 0' }}>Посада в структурі: {vacancy.postUnit.name}</p> : null}
          {vacancy.description ? <p style={{ fontSize: 13, margin: '6px 0 0' }}>{vacancy.description}</p> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={status}
            disabled={pending}
            onChange={(e) => { const v = e.target.value as Vacancy['status']; setStatus(v); start(() => updateVacancy(companyId, vacancy.id, { status: v })); }}
            style={inp}
          >
            <option value="OPEN">Відкрита</option>
            <option value="ON_HOLD">На паузі</option>
            <option value="CLOSED">Закрита</option>
          </select>
          <button
            style={ghost}
            onClick={() => { if (confirm('Видалити вакансію разом з кандидатами?')) start(() => deleteVacancy(companyId, vacancy.id)); }}
          >
            Видалити вакансію
          </button>
        </div>
      </div>

      <div style={{ margin: '14px 0' }}>
        {!showAdd ? (
          <button style={btn} onClick={() => setShowAdd(true)}>+ Додати кандидата</button>
        ) : (
          <AddCandidateForm companyId={companyId} vacancyId={vacancy.id} onDone={() => setShowAdd(false)} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {STAGES.map((s) => {
          const items = vacancy.candidates.filter((c) => c.stage === s.key);
          return (
            <div key={s.key} style={{ ...card, padding: 10, minHeight: 80 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.label}</span>
                <span style={muted}>{items.length}</span>
              </div>
              {s.key === 'HIRED' && items.length === 0 && (
                <p style={{ fontSize: 11, ...muted, marginTop: 0 }}>Переведення сюди створює працівника й закриває вакансію.</p>
              )}
              <div style={{ display: 'grid', gap: 6 }}>
                {items.map((c) => (
                  <CandidateCard key={c.id} companyId={companyId} vacancyId={vacancy.id} candidate={c} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CandidateCard({ companyId, vacancyId, candidate }: { companyId: string; vacancyId: string; candidate: Candidate }) {
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(candidate.notes ?? '');

  return (
    <div style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 7, padding: 8, display: 'grid', gap: 5 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{candidate.name}</div>
      <div style={{ fontSize: 11, ...muted }}>
        {[candidate.telegramUsername ? `@${candidate.telegramUsername}` : null, candidate.email, candidate.phone].filter(Boolean).join(' · ') || '—'}
      </div>
      <select
        value={candidate.stage}
        disabled={pending}
        onChange={(e) => start(() => updateCandidate(companyId, vacancyId, candidate.id, { stage: e.target.value }))}
        style={{ ...inp, fontSize: 11.5 }}
      >
        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <textarea
        value={notes}
        placeholder="Нотатки…"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => { if (notes !== (candidate.notes ?? '')) start(() => updateCandidate(companyId, vacancyId, candidate.id, { notes })); }}
        rows={2}
        style={{ ...inp, fontSize: 11.5, resize: 'vertical' }}
      />
      <button style={{ ...ghost, alignSelf: 'flex-start' }} onClick={() => start(() => deleteCandidate(companyId, vacancyId, candidate.id))}>Видалити</button>
    </div>
  );
}

function AddCandidateForm({ companyId, vacancyId, onDone }: { companyId: string; vacancyId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, start] = useTransition();

  const submit = () => {
    if (!name.trim()) return;
    start(async () => {
      await addCandidate(companyId, vacancyId, {
        name: name.trim(),
        telegramUsername: telegramUsername.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      onDone();
    });
  };

  return (
    <div style={{ ...card, borderColor: 'hsl(var(--primary))', padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input autoFocus placeholder="Імʼя кандидата" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} style={{ ...inp, width: 180 }} />
      <input placeholder="telegram (без @)" value={telegramUsername} onChange={(e) => setTelegramUsername(e.target.value)} style={{ ...inp, width: 140 }} />
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inp, width: 160 }} />
      <input placeholder="телефон" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inp, width: 130 }} />
      <button disabled={pending} onClick={submit} style={btn}>{pending ? '…' : 'Додати'}</button>
      <button onClick={onDone} style={ghost}>Скасувати</button>
    </div>
  );
}
