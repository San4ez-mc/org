'use client';
import { usePathname } from 'next/navigation';

interface Item { icon: string; label: string; href: string; active: boolean }

export default function Sidebar() {
  const path = usePathname() || '/';
  const m = path.match(/^\/company\/([^/]+)/);
  const companyId = m?.[1];

  // Глобальні пункти — видно завжди
  const globalItems: Item[] = [
    { icon: '🏢', label: 'Компанії', href: '/', active: path === '/' },
    { icon: '🩺', label: 'Логи', href: '/logs', active: path === '/logs' },
  ];

  // Пункти компанії — з'являються ЛИШЕ після вибору компанії
  const companyItems: Item[] = companyId
    ? [
        { icon: '🏠', label: 'Огляд', href: `/company/${companyId}`, active: path === `/company/${companyId}` },
        { icon: '📊', label: 'Дашборд', href: `/company/${companyId}/dashboard`, active: path.endsWith('/dashboard') },
        { icon: '🗂️', label: 'Орг.структура', href: `/company/${companyId}/structure`, active: path.endsWith('/structure') },
        { icon: '⚙️', label: 'Процеси', href: `/company/${companyId}/processes`, active: path.includes('/processes') },
        { icon: '📈', label: 'Статистики', href: `/company/${companyId}/stats`, active: path.endsWith('/stats') },
        { icon: '📄', label: 'Інструкції', href: `/company/${companyId}/instructions`, active: path.endsWith('/instructions') },
        { icon: '⬆️', label: 'Імпорт', href: `/company/${companyId}/import`, active: path.endsWith('/import') },
        { icon: '📓', label: 'Журнал', href: `/company/${companyId}/journal`, active: path.endsWith('/journal') },
        { icon: '🔬', label: 'Діагностика', href: `/company/${companyId}/health`, active: path.endsWith('/health') },
      ]
    : [];

  return (
    <nav
      style={{
        width: 72, flex: '0 0 72px', borderRight: '1px solid hsl(var(--border))',
        background: 'hsl(var(--card))', padding: '12px 6px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      {globalItems.map((it) => <NavLink key={it.label} item={it} />)}

      {companyId && (
        <div style={{ borderTop: '1px solid hsl(var(--border))', margin: '8px 4px 6px' }} />
      )}

      {companyItems.map((it) => <NavLink key={it.label} item={it} />)}
    </nav>
  );
}

function NavLink({ item }: { item: Item }) {
  return (
    <a href={item.href} title={item.label} style={{ textDecoration: 'none' }}>
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '9px 2px', borderRadius: 8,
          background: item.active ? 'hsl(var(--muted))' : 'transparent',
          color: item.active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
          borderLeft: item.active ? '2px solid hsl(var(--primary))' : '2px solid transparent',
        }}
      >
        <span style={{ fontSize: 18 }}>{item.icon}</span>
        <span style={{ fontSize: 9.5, textAlign: 'center', lineHeight: 1.1 }}>{item.label}</span>
      </div>
    </a>
  );
}
