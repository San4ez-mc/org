import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, ACCESS_MAX_AGE, encodeAccess } from '@/lib/access';

// Callback SSO (#284): перевіряємо state, міняємо code→token,
// і — за успіху — ставимо сесійний cookie ОРГ (той самий механізм, що й пароль).
export async function GET(req: NextRequest) {
  const sso = process.env.SSO_URL ?? 'http://localhost:4600';
  const base = process.env.ORG_BASE_URL ?? 'http://localhost:4300';
  const clientId = process.env.ORG_SSO_CLIENT_ID ?? '';
  const clientSecret = process.env.ORG_SSO_CLIENT_SECRET ?? '';

  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const savedState = cookies().get('sso_state')?.value ?? '';

  if (!code || !state || state !== savedState) {
    console.error('[sso callback] state/code перевірка не пройдена', { hasCode: !!code, hasState: !!state, stateMatch: state === savedState });
    return NextResponse.redirect(`${base}/login?e=sso`);
  }

  try {
    const tokenRes = await fetch(`${sso}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${base}/auth/sso/callback`,
      }),
      cache: 'no-store',
    });
    if (!tokenRes.ok) {
      console.error('[sso callback] обмін токена не вдався', tokenRes.status, await tokenRes.text().catch(() => ''));
      return NextResponse.redirect(`${base}/login?e=sso`);
    }
    const data = (await tokenRes.json()) as { user?: { id?: string; email?: string; name?: string } };

    // Права з SSO. Без них користувач не побачить нічого: `org_session` лишається
    // спільним для всіх, тож саме ця кука вирішує, чиї компанії видно.
    let access = { userId: '', email: '', role: 'none' as 'superadmin' | 'user' | 'none', companyIds: [] as string[], pageIds: [] as string[] };
    if (data.user?.id) {
      try {
        const permRes = await fetch(`${sso}/oauth/permissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, userId: data.user.id, product: 'org' }),
          cache: 'no-store',
        });
        if (permRes.ok) {
          const p = (await permRes.json()) as { role?: string; projectIds?: string[]; pageIds?: string[] };
          access = {
            userId: data.user.id,
            email: data.user.email ?? '',
            role: p.role === 'superadmin' ? 'superadmin' : p.role === 'user' ? 'user' : 'none',
            companyIds: Array.isArray(p.projectIds) ? p.projectIds : [],
            pageIds: Array.isArray(p.pageIds) ? p.pageIds : [],
          };
        } else {
          console.error('[sso callback] права не отримані', permRes.status);
        }
      } catch (err) {
        // Мовчазний фолбек у «повний доступ» тут був би найгіршим сценарієм:
        // збій мережі відкривав би всі компанії. Лишаємо role=none.
        console.error('[sso callback] SSO не віддав права:', err);
      }
    }

    if (access.role === 'none') {
      return NextResponse.redirect(`${base}/login?e=noaccess`);
    }

    const res = NextResponse.redirect(`${base}/`);
    // Той самий сесійний токен, що й вхід за паролем — middleware пропустить.
    res.cookies.set('org_session', process.env.AUTH_TOKEN ?? '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.set(ACCESS_COOKIE, encodeAccess(access), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_MAX_AGE,
    });
    // Хто увійшов — лише для показу в інтерфейсі. Доступ дає підписана org_access.
    if (data.user?.email) {
      res.cookies.set('org_user', data.user.email, {
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    res.cookies.set('sso_state', '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('[sso callback] виняток (SSO недоступний?):', err);
    return NextResponse.redirect(`${base}/login?e=sso`);
  }
}
