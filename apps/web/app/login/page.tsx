export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }: { searchParams: { e?: string } }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 28, width: 320 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🧬 Жива Орг.Платформа</div>
        <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 18 }}>Вхід до пульта</div>
        {searchParams.e === 'sso' && <div style={{ fontSize: 12, color: '#e07a7a', marginBottom: 12 }}>Не вдалося увійти через FINEKO. Спробуйте ще раз.</div>}
        <a href="/auth/sso" style={{ display: 'block', width: '100%', textAlign: 'center', background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, textDecoration: 'none', boxSizing: 'border-box' }}>
          Увійти через FINEKO
        </a>
      </div>
    </div>
  );
}
