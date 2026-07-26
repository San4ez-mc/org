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
  const hasFolder = !!company.driveRootFolderId;       // папка підключена
  const hasExclusions = (company.driveExcludedIds?.length ?? 0) > 0; // #302 хоч один файл виключено
  const hasStructure = (company.orgUnits?.length ?? 0) > 0;  // агент побудував скелет

  const steps = [
    { n: 1, title: 'Підключити робочу папку компанії', desc: 'Google Drive: система прочитає файли й створюватиме посадові інструкції саме тут.', href: `/company/${id}/folder`, cta: 'Підключити папку', done: hasFolder, available: true },
    { n: 2, title: 'Виключити зайве з індексації', desc: 'У дереві файлів/папок познач ті, що система НЕ має читати (особисте, чернетки, архіви).', href: `/company/${id}/folder`, cta: 'Позначити зайве', done: hasExclusions, available: hasFolder },
    { n: 3, title: 'Запустити індексацію у вектор', desc: 'Записати всі дозволені файли у вектор-базу + авто-визначення посад/інструкцій/процесів із документів.', href: `/company/${id}/folder`, cta: 'Індексувати', done: false, available: hasFolder },
    { n: 4, title: 'AI-агент: інтервʼю → скелет структури', desc: 'Агент опитує про відділення, посади, команду і будує основну орг-структуру.', href: `/company/${id}/structure`, cta: 'Запустити агента', done: hasStructure, available: hasFolder },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <CompanyHeader company={company} />
      <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: '4px 0 4px' }}>План заведення компанії</h2>
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13.5, margin: '0 0 10px' }}>
          Пройди кроки по черзі — орг-структура, папки, процеси та інструкції зʼявляться в системі.
        </p>

        {/* Прогрес-смужка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 20px' }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'hsl(var(--muted))', overflow: 'hidden' }}>
            <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: 'hsl(142 45% 42%)', borderRadius: 999, transition: 'width .3s' }} />
          </div>
          <span style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>{doneCount} / {steps.length}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps.map((s) => {
            const state = s.done ? 'done' : s.available ? 'active' : 'locked';
            const border = state === 'done' ? 'hsl(142 40% 30% / 0.5)' : state === 'active' ? 'hsl(var(--border))' : 'hsl(var(--border))';
            return (
              <div key={s.n} style={{
                display: 'flex', gap: 14, alignItems: 'center', padding: '16px 18px',
                background: 'hsl(var(--card))', border: `1px solid ${border}`, borderRadius: 14,
                opacity: state === 'locked' ? 0.5 : 1,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                  background: state === 'done' ? 'hsl(142 45% 32%)' : state === 'active' ? 'hsl(var(--foreground) / 0.14)' : 'hsl(var(--muted))',
                  color: state === 'done' ? '#fff' : state === 'active' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                }}>{state === 'done' ? '✓' : state === 'locked' ? '🔒' : s.n}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginTop: 4, lineHeight: 1.5 }}>{s.desc}</div>
                </div>

                {state !== 'locked' && (
                  <a href={s.href} style={{
                    flexShrink: 0, textAlign: 'center', minWidth: 128, boxSizing: 'border-box',
                    textDecoration: 'none', fontSize: 13, fontWeight: 600, letterSpacing: 0.1,
                    padding: '9px 16px', borderRadius: 9,
                    background: state === 'done' ? 'transparent' : 'hsl(var(--foreground) / 0.10)',
                    color: state === 'done' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                    border: '1px solid hsl(var(--border))',
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
