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
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <aside
            style={{
              width: 240,
              borderRight: '1px solid hsl(var(--border))',
              padding: '20px 16px',
              background: 'hsl(var(--card))',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>🧬 Орг.Платформа</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              <a href="/" style={{ color: 'hsl(var(--foreground))', textDecoration: 'none', padding: '8px 10px', borderRadius: 8 }}>
                Компанії
              </a>
              <span style={{ color: 'hsl(var(--muted-foreground))', padding: '8px 10px' }}>Процеси · скоро</span>
              <span style={{ color: 'hsl(var(--muted-foreground))', padding: '8px 10px' }}>Інструкції · скоро</span>
            </nav>
          </aside>
          <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
