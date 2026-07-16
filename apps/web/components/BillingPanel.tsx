'use client';
import { useTransition } from 'react';
import type { Billing } from '@/lib/api';
import { createInvoice, markInvoicePaid, cancelInvoice } from '@/app/company/[id]/actions';

const card = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' } as const;
const muted = { color: 'hsl(var(--muted-foreground))' } as const;
const ghost = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' } as const;
const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', padding: '8px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;
const td = { fontSize: 13, padding: '10px 12px', borderBottom: '1px solid hsl(var(--border))' } as const;

const STATE_LABEL: Record<string, string> = { trial: 'Тріал', active: 'Активна', past_due: 'Прострочено', expired: 'Не активна' };
const STATE_COLOR: Record<string, string> = { trial: '#e5c76b', active: '#6bbf72', past_due: '#e08a4f', expired: '#e05c5c' };
const INVOICE_LABEL: Record<string, string> = { PENDING: 'очікує оплати', PAID: 'оплачено', CANCELED: 'скасовано' };

export default function BillingPanel({ companyId, billing }: { companyId: string; billing: Billing }) {
  const [pending, start] = useTransition();

  const daysLeft = billing.trialEndsAt ? Math.ceil((new Date(billing.trialEndsAt).getTime() - Date.now()) / 86400000) : null;
  const usagePct = billing.memberLimit ? Math.min(100, Math.round((billing.memberCount / billing.memberLimit) * 100)) : 0;

  return (
    <div>
      <div style={{ ...card, padding: 16, marginBottom: 20, display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, ...muted }}>Тариф</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{billing.planDef.name}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, ...muted }}>Стан</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: STATE_COLOR[billing.state] }}>{STATE_LABEL[billing.state]}</span>
          {billing.legacy && <span style={{ fontSize: 11, ...muted, marginLeft: 6 }}>(створена до білінгу — без обмежень)</span>}
        </div>
        {billing.state === 'trial' && billing.trialEndsAt && (
          <div>
            <div style={{ fontSize: 12, ...muted }}>Тріал до</div>
            <div style={{ fontSize: 13 }}>{new Date(billing.trialEndsAt).toLocaleDateString('uk-UA')} {daysLeft !== null && (daysLeft >= 0 ? `(${daysLeft} дн.)` : '(закінчився)')}</div>
          </div>
        )}
        {billing.subscriptionRenewsAt && (
          <div>
            <div style={{ fontSize: 12, ...muted }}>Оплачено до</div>
            <div style={{ fontSize: 13 }}>{new Date(billing.subscriptionRenewsAt).toLocaleDateString('uk-UA')}</div>
          </div>
        )}
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 12, ...muted }}>Працівники</div>
          <div style={{ fontSize: 13 }}>{billing.memberCount} / {billing.memberLimit ?? '∞'}</div>
          {billing.memberLimit != null && (
            <div style={{ height: 5, borderRadius: 3, background: 'hsl(var(--muted))', marginTop: 4, overflow: 'hidden', width: 140 }}>
              <div style={{ height: '100%', width: `${usagePct}%`, background: usagePct >= 100 ? '#e05c5c' : 'hsl(var(--primary))' }} />
            </div>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Тарифи</h3>
      <p style={{ fontSize: 12, ...muted, margin: '0 0 10px' }}>Платіжного шлюзу поки нема — «Виставити рахунок» створює запис і його підтверджують вручну після оплати переказом.</p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginBottom: 24 }}>
        {billing.plans.map((p) => (
          <div key={p.code} style={{ ...card, padding: 14, border: p.code === billing.plan ? '1px solid hsl(var(--primary))' : card.border }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name} {p.code === billing.plan && <span style={{ fontSize: 11, ...muted }}>(поточний)</span>}</div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0' }}>{p.priceUAH === 0 ? 'безкоштовно' : `${p.priceUAH} ₴/міс`}</div>
            <div style={{ fontSize: 12, ...muted, marginBottom: 10 }}>{p.description}</div>
            {p.priceUAH > 0 && (
              <button disabled={pending} style={ghost} onClick={() => start(() => createInvoice(companyId, { planCode: p.code }))}>
                {pending ? '…' : 'Виставити рахунок'}
              </button>
            )}
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Рахунки</h3>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Дата</th>
              <th style={th}>Тариф</th>
              <th style={th}>Сума</th>
              <th style={th}>Статус</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {billing.invoices.map((inv) => (
              <tr key={inv.id}>
                <td style={td}>{new Date(inv.createdAt).toLocaleDateString('uk-UA')}</td>
                <td style={td}>{inv.plan}</td>
                <td style={td}>{inv.amount} {inv.currency}</td>
                <td style={td}>{INVOICE_LABEL[inv.status]}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {inv.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button style={ghost} disabled={pending} onClick={() => start(() => markInvoicePaid(companyId, inv.id))}>Позначити оплаченим</button>
                      <button style={ghost} disabled={pending} onClick={() => start(() => cancelInvoice(companyId, inv.id))}>Скасувати</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!billing.invoices.length && <tr><td style={{ ...td, ...muted }} colSpan={5}>Рахунків ще немає.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
