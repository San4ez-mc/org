'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const pw = String(formData.get('password') ?? '');
  if (pw && pw === process.env.ADMIN_PASSWORD) {
    cookies().set('org_session', process.env.AUTH_TOKEN ?? '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect('/');
  }
  redirect('/login?e=1');
}

export async function logout() {
  cookies().set('org_session', '', { path: '/', maxAge: 0 });
  redirect('/login');
}
