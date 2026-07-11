'use client';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const path = usePathname() || '/';
  const m = path.match(/^\/company\/([^/]+)/);
  const companyId = m?.[1];

  const items = [
    { icon: '🏢', label: 'Компанії', href: '/', active: path === '/' || (path.startsWith('/company/') && !path.endsWith('/structure') && !path.includes('/processes')) },
    { icon: '🗂️', label: 'Орг.структура', href: companyId ? `/company/${companyId}/structure` : '/', active: path.endsWith('/structure'), disabled: !companyId },
    { icon: '⚙️', label: 'Процеси', href: companyId ? `/company/${companyId}/processes` : '/', active: path.includes('/processes'), disabled: !companyId },
    { icon: '📄', label: 'Інструкції', href: companyId ? `/company/${companyId}/instructions` : '/', active: path.endsWith('/instructions'), disabled: !companyId },
    { icon: '📓', label: 'Журнал', href: companyId ? `/company/${companyId}/journal` : '/', active: path.endsWith('/journal'), disabled: !companyId },
    { icon: '🩺', label: 'Логи', href: '/logs', active: path === '/logs' },
  ];

  return (
    <nav
      style={{
        width: 72, flex: '0 0 72px', borderRight: '1px solid hsl(var(--border))',
        background: 'hsl(var(--card))', padding: '12px 6px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      {items.map((it) => (
        <a
          key={it.label}
          href={it.disabled ? undefined : it.href}
          title={it.disabled && it.label !== 'Інструкції' ? 'Спершу оберіть компанію' : it.label}
          style={{ textDecoration: 'none', cursor: it.disabled ? 'default' : 'pointer' }}
        >
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '9px 2px', borderRadius: 8,
              background: it.active ? 'hsl(var(--muted))' : 'transparent',
              color: it.active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              opacity: it.disabled ? 0.45 : 1,
              borderLeft: it.active ? '2px solid hsl(var(--primary))' : '2px solid transparent',
            }}
          >
            <span style={{ fontSize: 18 }}>{it.icon}</span>
            <span style={{ fontSize: 9.5, textAlign: 'center', lineHeight: 1.1 }}>{it.label}</span>
          </div>
        </a>
      ))}
    </nav>
  );
}
