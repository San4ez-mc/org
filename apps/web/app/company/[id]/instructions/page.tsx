import { getCompany, getInstructions } from '@/lib/api';
import CompanyHeader from '@/components/CompanyTabs';
import DriveTree from '@/components/DriveTree';

export const dynamic = 'force-dynamic';

export default async function InstructionsPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id).catch(() => null);
  if (!company) return <p style={{ color: 'hsl(var(--muted-foreground))' }}>Компанію не знайдено.</p>;
  const tree = await getInstructions(params.id).catch(() => []);

  return (
    <div>
      <CompanyHeader company={company} />
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0 6px' }}>Посадові інструкції</h2>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
        Оригінали з Google Drive (Відділення побудови → Посадові інструкції). Клікни на інструкцію — відкриється на Drive.
      </p>

      <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 14, maxWidth: 720 }}>
        {tree.length ? <DriveTree nodes={tree} /> : <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Папку інструкцій ще не знайдено на Drive.</p>}
      </div>
    </div>
  );
}
