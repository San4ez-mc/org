import { getCompany, getVacancy } from '@/lib/api';
import VacancyBoard from '@/components/VacancyBoard';

export const dynamic = 'force-dynamic';

export default async function VacancyPage({ params }: { params: { id: string; vacancyId: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;
  const vacancy = await getVacancy(params.vacancyId);
  if (!vacancy) {
    return (
      <div>
        <a href={`/company/${company.id}/vacancies`} style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>← Рекрутинг-воронка</a>
        <p style={{ color: 'hsl(var(--muted-foreground))', marginTop: 12 }}>Вакансію не знайдено.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 }}>
        <a href={`/company/${company.id}/vacancies`} style={{ color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>← Рекрутинг-воронка</a>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>·</span>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{company.name}</span>
      </div>
      <VacancyBoard companyId={company.id} vacancy={vacancy} />
    </div>
  );
}
