import { getCompany, getPayroll } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import PayrollTable from '@/components/PayrollTable';

export const dynamic = 'force-dynamic';

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const statCard = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '12px 14px' } as const;

export default async function PayrollPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={muted}>Компанію не знайдено.</p>;
  const payroll = await getPayroll(params.id).catch(() => null);

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 6px' }}>Вартість оргструктури</h2>
      <p style={{ fontSize: 12.5, ...muted, marginBottom: 14 }}>
        ФОП по відділеннях і планування штату — вкажи місячну вартість кожної посади (незалежно від того, зайнята вона чи вакантна).
      </p>

      {!payroll ? (
        <p style={muted}>Не вдалось завантажити дані.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16, maxWidth: 820 }}>
            <div style={statCard}>
              <div style={{ ...muted, fontSize: 11.5 }}>Плановий ФОП (усі посади)</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{uah(payroll.company.totalMonthly)}</div>
            </div>
            <div style={statCard}>
              <div style={{ ...muted, fontSize: 11.5 }}>Поточний ФОП (зайняті)</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: '#6bbf72' }}>{uah(payroll.company.filledMonthly)}</div>
            </div>
            <div style={statCard}>
              <div style={{ ...muted, fontSize: 11.5 }}>Бюджет на найм (вакансії)</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: '#d6b84f' }}>{uah(payroll.company.vacantMonthly)}</div>
            </div>
            <div style={statCard}>
              <div style={{ ...muted, fontSize: 11.5 }}>Посад / без вказаного ФОП</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                {payroll.company.postsTotal}
                {payroll.company.postsWithoutSalary > 0 ? <span style={{ fontSize: 13, fontWeight: 500, ...muted }}> ({payroll.company.postsWithoutSalary} без ФОП)</span> : null}
              </div>
            </div>
          </div>

          <PayrollTable companyId={params.id} divisions={payroll.divisions} />
        </>
      )}
    </div>
  );
}
