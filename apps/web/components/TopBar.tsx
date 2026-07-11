'use client';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/app/auth-actions';
import type { Company } from '@/lib/api';

export default function TopBar({ companies }: { companies: Company[] }) {
  const path = usePathname() || '/';
  const router = useRouter();
  const m = path.match(/^\/company\/([^/]+)/);
  const companyId = m?.[1];

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 20, height: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '1px solid hsl(var(--border))',
        background: 'hsl(var(--card))',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 14 }}>🧬 Жива Орг.Платформа</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <select
          value={companyId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            router.push(id ? `/company/${id}` : '/');
          }}
          title="Оберіть компанію"
          style={{
            background: 'hsl(var(--background))', color: 'inherit',
            border: '1px solid hsl(var(--border))', borderRadius: 8,
            padding: '5px 10px', fontSize: 12.5, maxWidth: 240,
          }}
        >
          <option value="">— усі компанії —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <form action={logout}>
          <button
            type="submit"
            title="Вийти"
            style={{
              background: 'transparent', color: 'hsl(var(--muted-foreground))',
              border: '1px solid hsl(var(--border))', borderRadius: 8,
              padding: '5px 12px', fontSize: 12.5, cursor: 'pointer',
            }}
          >
            Вийти ↩
          </button>
        </form>
      </div>
    </header>
  );
}
