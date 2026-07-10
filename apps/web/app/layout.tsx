import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Жива Орг.Платформа',
  description: 'Орг.структура · процеси · посадові інструкції',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk" className="dark">
      <body>
        {/* Тонкий верхній бар */}
        <header
          style={{
            position: 'sticky', top: 0, zIndex: 20, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', borderBottom: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14 }}>🧬 Жива Орг.Платформа</span>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>адмін-пульт</span>
        </header>

        <div style={{ display: 'flex', minHeight: 'calc(100vh - 44px)' }}>
          {/* Вузьке меню зліва */}
          <nav
            style={{
              width: 68, flex: '0 0 68px', borderRight: '1px solid hsl(var(--border))',
              background: 'hsl(var(--card))', padding: '12px 6px',
              display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch',
            }}
          >
            <NavItem href="/" icon="🏢" label="Компанії" />
            <NavItem icon="⚙️" label="Процеси" muted />
            <NavItem icon="📄" label="Інструкції" muted />
          </nav>

          <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1200, overflowX: 'auto' }}>{children}</main>
        </div>
      </body>
    </html>
  );
}

function NavItem({ href, icon, label, muted }: { href?: string; icon: string; label: string; muted?: boolean }) {
  const inner = (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '8px 2px', borderRadius: 8, cursor: muted ? 'default' : 'pointer',
        color: muted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
        opacity: muted ? 0.55 : 1,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.1 }}>{label}</span>
    </div>
  );
  if (!href) return inner;
  return (
    <a href={href} style={{ textDecoration: 'none' }}>
      {inner}
    </a>
  );
}
