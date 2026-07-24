import SalesChatbot from '@/components/SalesChatbot';

export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }: { searchParams: { e?: string } }) {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
        // Фон: згенероване зображення (поклади у public/login-bg.png) + градієнт-підкладка
        backgroundImage:
          "radial-gradient(1200px 600px at 20% 10%, hsl(220 70% 15% / 0.55), transparent), " +
          "radial-gradient(900px 500px at 90% 90%, hsl(280 60% 18% / 0.5), transparent), " +
          "linear-gradient(135deg, hsl(222 47% 6%), hsl(222 47% 9%)), " +
          "url('/login-bg.png')",
        backgroundSize: 'cover, cover, cover, cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'normal',
      }}
    >
      {/* Затемнення поверх фото для читабельності */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, hsl(222 47% 4% / 0.35), hsl(222 47% 4% / 0.7))' }} />
      {/* Мʼяке затемнення правого-нижнього кута (розчиняє залишковий вотермарк) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(46% 42% at 100% 100%, hsl(222 45% 5% / 0.94) 0%, hsl(222 45% 5% / 0.55) 42%, transparent 72%)' }} />

      <div
        style={{
          position: 'relative',
          background: 'hsl(222 30% 10% / 0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid hsl(0 0% 100% / 0.1)',
          borderRadius: 18,
          padding: '34px 30px',
          width: 340,
          boxShadow: '0 24px 70px hsl(222 60% 2% / 0.6), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.02em' }}>
          🧬 Жива Орг.Платформа
        </div>
        <div style={{ fontSize: 13.5, color: 'hsl(215 20% 70%)', marginBottom: 22, lineHeight: 1.5 }}>
          Структура · процеси · посадові інструкції — жива модель твого бізнесу.
        </div>
        {searchParams.e === 'sso' && (
          <div style={{ fontSize: 12, color: '#f0a0a0', marginBottom: 14 }}>Не вдалося увійти через FINEKO. Спробуйте ще раз.</div>
        )}
        <a
          href="/auth/sso"
          style={{
            display: 'block', width: '100%', textAlign: 'center', boxSizing: 'border-box',
            background: 'linear-gradient(135deg, hsl(0 72% 55%), hsl(350 75% 48%))',
            color: '#fff', border: 'none', borderRadius: 11, padding: '13px', fontSize: 14.5, fontWeight: 600,
            textDecoration: 'none', boxShadow: '0 8px 24px hsl(0 72% 45% / 0.35)',
          }}
        >
          Увійти через FINEKO →
        </a>
      </div>

      {/* Продажний асистент (заготовка) */}
      <SalesChatbot />
    </div>
  );
}
