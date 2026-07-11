import { login } from '@/app/auth-actions';

export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }: { searchParams: { e?: string } }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form action={login} style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: 28, width: 320 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🧬 Жива Орг.Платформа</div>
        <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 18 }}>Вхід до пульта</div>
        <input
          name="password"
          type="password"
          autoFocus
          placeholder="Пароль"
          style={{ width: '100%', background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '9px 12px', color: 'inherit', fontSize: 14, marginBottom: 12 }}
        />
        {searchParams.e && <div style={{ fontSize: 12, color: '#e07a7a', marginBottom: 10 }}>Невірний пароль</div>}
        <button type="submit" style={{ width: '100%', background: 'hsl(var(--primary))', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, cursor: 'pointer' }}>
          Увійти
        </button>
      </form>
    </div>
  );
}
