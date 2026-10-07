import { notFound } from 'next/navigation';
import { currentAccess } from '@/lib/access';
import { listRedFlags } from './actions';
import RedFlagRowView from './RedFlagRowView';

export const dynamic = 'force-dynamic';

export default async function RedFlagsPage() {
  const a = await currentAccess();
  // Для не-супер-адміна сторінки «не існує»: не підтверджуємо навіть наявність каналу.
  if (!a || a.role !== 'superadmin') notFound();
  const flags = await listRedFlags().catch(() => null);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🔒 Тихий канал</h1>
      <p style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>
        Конфіденційні повідомлення працівників. Бачите лише ви: ні керівники, ні власники компаній доступу не мають.
      </p>
      {!flags ? (
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>Не вдалось завантажити. Перевірте ORG_ADMIN_KEY на сервері.</p>
      ) : flags.length === 0 ? (
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>Повідомлень поки немає.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>{flags.map((f) => <RedFlagRowView key={f.id} flag={f} />)}</div>
      )}
    </div>
  );
}
