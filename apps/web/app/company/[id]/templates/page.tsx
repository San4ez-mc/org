import { getCompany, getTemplates } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import CloneTemplateCard from '@/components/CloneTemplateCard';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;
  const templates = await getTemplates().catch(() => []);

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 6px' }}>Бібліотека шаблонів</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
        Типові посади, процеси й інструкції по галузях — додаються поверх уже наявної структури компанії.
        Повторне клонування не створює дублікатів (перевіряється за назвою).
      </p>

      {templates.length === 0 ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Шаблонів поки немає.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          {templates.map((t) => (
            <CloneTemplateCard key={t.key} companyId={params.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}
