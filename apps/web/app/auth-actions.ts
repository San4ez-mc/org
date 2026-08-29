'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, ACCESS_MAX_AGE, encodeAccess } from '@/lib/access';

export async function login(formData: FormData) {
  const pw = String(formData.get('password') ?? '');
  if (pw && pw === process.env.ADMIN_PASSWORD) {
    cookies().set('org_session', process.env.AUTH_TOKEN ?? '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    // Вхід за майстер-паролем — це вхід власника, тож повні права.
    // Вхід користувачів іде через SSO, де права беруться з їхньої картки доступів.
    cookies().set(
      ACCESS_COOKIE,
      encodeAccess({ userId: 'owner', email: 'owner', role: 'superadmin', companyIds: [], pageIds: [] }),
      { httpOnly: true, sameSite: 'lax', path: '/', maxAge: ACCESS_MAX_AGE },
    );
    redirect('/');
  }
  redirect('/login?e=1');
}

export async function logout() {
  cookies().set('org_session', '', { path: '/', maxAge: 0 });
  cookies().set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  cookies().set('org_user', '', { path: '/', maxAge: 0 });
  redirect('/login');
}
