import { getCompany } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';

export const dynamic = 'force-dynamic';

export default async function CompanyOverview({ params }: { params: { id: string } }) {
  let company;
  try {
    company = await getCompany(params.id);
  } catch {
    return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено або API недоступний.</p>;
  }

  const id = company.id;
  const s1 = !!company.driveRootFolderId;              // папка підключена
  const s2 = (company.orgUnits?.length ?? 0) > 0;      // є орг-структура
  const s3 = (company.processes?.length ?? 0) > 0;     // є процеси
  const s4 = false;                                    // інструкції (створюються на Drive)

  const steps = [
    { n: 1, title: 'Підключити робочу папку компанії', desc: 'Google Drive: система прочитає й проіндексує файли, і саме туди створюватиме посадові інструкції.', href: `/company/${id}/folder`, cta: 'Підключити папку', done: s1, available: true },
    { n: 2, title: 'Створити орг-структуру', desc: 'Відділення, посади, ЦКП — через бота-агента або імпорт.', href: `/company/${id}/structure`, cta: 'До структури', done: s2, available: s1 },
    { n: 3, title: 'Описати бізнес-процеси', desc: 'Хто за що відповідає, кроки процесів.', href: `/company/${id}/processes`, cta: 'До процесів', done: s3, available: s2 },
    { n: 4, title: 'Посадові інструкції', desc: 'Створюються на Google Drive у підключеній папці, привʼязані до посад.', href: `/company/${id}/instructions`, cta: 'До інструкцій', done: s4, available: s3 },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <CompanyHeader company={company} />
      <div style={{ maxWidth: 720, marginTop: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>План заведення компанії</h2>
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13.5, margin: '0 0 18px' }}>
          Пройди кроки по черзі — орг-структура, папки, процеси та інструкції зʼявляться в системі. Виконано: {doneCount}/{steps.length}.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s) => {
            const state = s.done ? 'done' : s.available ? 'active' : 'locked';
            const border = state === 'done' ? 'hsl(142 45% 35%)' : state === 'active' ? 'hsl(var(--primary))' : 'hsl(var(--border))';
            return (
              <div key={s.n} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16,
                background: 'hsl(var(--card))', border: `1px solid ${border}`, borderRadius: 12,
                opacity: state === 'locked' ? 0.55 : 1,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                  background: state === 'done' ? 'hsl(142 45% 30%)' : state === 'active' ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                  color: state === 'locked' ? 'hsl(var(--muted-foreground))' : '#fff',
                }}>{state === 'done' ? '✓' : state === 'locked' ? '🔒' : s.n}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginTop: 3, lineHeight: 1.5 }}>{s.desc}</div>
                </div>

                {state !== 'locked' && (
                  <a href={s.href} style={{
                    flexShrink: 0, alignSelf: 'center', textDecoration: 'none', fontSize: 13, fontWeight: 500,
                    padding: '8px 14px', borderRadius: 8,
                    background: state === 'done' ? 'transparent' : 'hsl(var(--primary))',
                    color: state === 'done' ? 'hsl(var(--primary))' : '#fff',
                    border: state === 'done' ? '1px solid hsl(var(--border))' : 'none',
                  }}>{state === 'done' ? 'Відкрити' : s.cta}</a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
