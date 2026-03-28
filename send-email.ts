/*
  ============================================================
  VENDIO EMAIL NOTIFICATIONS — Supabase Edge Function
  
  SETUP INSTRUCTIONS:
  ─────────────────────────────────────────────────────────────
  1. Install Supabase CLI:
       npm install -g supabase
  
  2. Login and link your project:
       supabase login
       supabase link --project-ref rtwbrcbifnowrqpgivma
  
  3. Create the function folder:
       supabase functions new send-email
  
  4. Replace supabase/functions/send-email/index.ts with this file
  
  5. Add your Resend API key as a secret:
       supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
     Get a free Resend API key at: https://resend.com
     (Free tier: 3,000 emails/month)
  
  6. Deploy the function:
       supabase functions deploy send-email --no-verify-jwt
  
  7. The function URL will be:
       https://rtwbrcbifnowrqpgivma.supabase.co/functions/v1/send-email
  
  TRIGGER: Call this function from your frontend after key events:
    - Order placed        → notify seller
    - Order delivered     → notify buyer  
    - Message sent        → notify receiver
    - Dispute opened      → notify both parties
    - Payout processed    → notify seller
    - Review left         → notify seller
  ─────────────────────────────────────────────────────────────
  
  HOW TO CALL FROM FRONTEND:
  ─────────────────────────────────────────────────────────────
  await fetch('https://rtwbrcbifnowrqpgivma.supabase.co/functions/v1/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sb_publishable_ydvrDDChpJ-pkeDLZlcJyA_Qqk0OUd7',
    },
    body: JSON.stringify({
      type:       'order_placed',
      to:         'seller@example.com',
      toName:     'Seller Name',
      orderRef:   '#TRX-000001',
      listingTitle:'Full-Stack Web App Development',
      amount:     '$299.00',
      buyerName:  'Ada Okonkwo',
      link:       'https://yourdomain.com/dashboard-seller.html',
    }),
  });
  ─────────────────────────────────────────────────────────────
*/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL     = 'Vendio <notifications@yourdomain.com>';
const BRAND_COLOR    = '#F59E0B';
const BRAND_DARK     = '#0a0a0a';
const SITE_URL       = 'https://yourdomain.com';

/* ── Email templates ── */
const templates: Record<string, (data: any) => { subject: string; html: string }> = {

  order_placed: (d) => ({
    subject: `🛒 New Order — ${d.orderRef}`,
    html: layout(`
      <h2>You have a new order!</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p><strong>${d.buyerName}</strong> just placed an order for your listing.</p>
      ${infoBox([
        ['Order', d.orderRef],
        ['Listing', d.listingTitle],
        ['Package', d.packageLabel || 'Basic'],
        ['Amount', d.amount],
        ['Delivery', d.deliveryDays ? `${d.deliveryDays} day(s)` : '—'],
      ])}
      <p>Payment is held in escrow and will be released once the buyer confirms delivery.</p>
      ${cta('View Order', d.link || SITE_URL + '/dashboard-seller.html')}
      <p style="color:#666;font-size:13px">Please start working on the order and keep the buyer updated.</p>
    `),
  }),

  order_delivered: (d) => ({
    subject: `📦 Delivery Confirmed — ${d.orderRef}`,
    html: layout(`
      <h2>Your delivery was confirmed!</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p><strong>${d.buyerName}</strong> has confirmed receipt of your delivery. Your payment has been released.</p>
      ${infoBox([
        ['Order', d.orderRef],
        ['Listing', d.listingTitle],
        ['Payout', d.amount],
      ])}
      ${cta('View Earnings', d.link || SITE_URL + '/dashboard-seller.html')}
      <p style="color:#666;font-size:13px">Thank you for your great service on Vendio!</p>
    `),
  }),

  order_confirmed_buyer: (d) => ({
    subject: `✅ Order Placed — ${d.orderRef}`,
    html: layout(`
      <h2>Your order is confirmed!</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p>Your payment is secured in escrow and <strong>${d.sellerName}</strong> has been notified to start work.</p>
      ${infoBox([
        ['Order', d.orderRef],
        ['Listing', d.listingTitle],
        ['Package', d.packageLabel || 'Basic'],
        ['Amount', d.amount],
        ['Estimated delivery', d.deliveryDays ? `${d.deliveryDays} day(s)` : '—'],
      ])}
      ${cta('Track Order', d.link || SITE_URL + '/dashboard-buyer.html')}
      <p style="color:#666;font-size:13px">Your money is safe in escrow until you confirm delivery. If anything goes wrong, you're covered by Vendio Buyer Protection.</p>
    `),
  }),

  new_message: (d) => ({
    subject: `💬 New message from ${d.senderName}`,
    html: layout(`
      <h2>You have a new message</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p><strong>${d.senderName}</strong> sent you a message about <em>${d.listingTitle}</em>:</p>
      <div style="background:#f9f9f9;border-left:4px solid ${BRAND_COLOR};padding:1rem 1.25rem;margin:1.25rem 0;border-radius:0 8px 8px 0;font-size:15px;color:#333;line-height:1.6">
        ${d.messagePreview}
      </div>
      ${cta('Reply Now', d.link || SITE_URL + '/dashboard-buyer.html')}
    `),
  }),

  dispute_opened: (d) => ({
    subject: `⚠️ Dispute Opened — Order ${d.orderRef}`,
    html: layout(`
      <h2 style="color:#EF4444">A dispute has been opened</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p>A dispute has been opened on order <strong>${d.orderRef}</strong>.</p>
      ${infoBox([
        ['Order', d.orderRef],
        ['Listing', d.listingTitle],
        ['Reason', d.reason?.replace(/_/g, ' ')],
      ])}
      <p>Our team will review this within <strong>24 hours</strong>. Both parties will be notified of the resolution.</p>
      ${cta('View Dispute', d.link || SITE_URL + '/dashboard-buyer.html')}
      <p style="color:#666;font-size:13px">Please do not make any transfers until the dispute is resolved.</p>
    `),
  }),

  dispute_resolved: (d) => ({
    subject: `✅ Dispute Resolved — Order ${d.orderRef}`,
    html: layout(`
      <h2>Your dispute has been resolved</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p>The Vendio team has reviewed your dispute for order <strong>${d.orderRef}</strong> and made a ruling.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:1rem 1.25rem;margin:1.25rem 0;border-radius:8px;font-size:15px;color:#166534">
        <strong>Resolution:</strong> ${d.resolution}
      </div>
      ${cta('View Details', d.link || SITE_URL + '/dashboard-buyer.html')}
    `),
  }),

  payout_processed: (d) => ({
    subject: `💰 Payout ${d.status === 'paid' ? 'Sent' : 'Update'} — $${d.amount}`,
    html: layout(`
      <h2>Payout ${d.status === 'paid' ? 'Sent! 🎉' : 'Update'}</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p>${d.status === 'paid'
        ? `Your payout of <strong>$${d.amount}</strong> has been sent to your ${d.method} account.`
        : `Your payout request status has been updated to <strong>${d.status}</strong>.`}</p>
      ${infoBox([
        ['Amount', '$' + d.amount],
        ['Method', d.method],
        ['Status', d.status],
        ...(d.reference ? [['Reference', d.reference]] : []),
      ])}
      ${cta('View Earnings', d.link || SITE_URL + '/dashboard-seller.html')}
      ${d.status === 'paid' ? '<p style="color:#666;font-size:13px">Please allow 1-3 business days for funds to appear in your account.</p>' : ''}
    `),
  }),

  review_received: (d) => ({
    subject: `⭐ New Review — ${d.listingTitle}`,
    html: layout(`
      <h2>You received a new review!</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p><strong>${d.buyerName}</strong> left a ${d.rating}-star review on your listing.</p>
      ${infoBox([
        ['Listing', d.listingTitle],
        ['Rating', '⭐'.repeat(d.rating) + ` (${d.rating}/5)`],
      ])}
      ${d.comment ? `<div style="background:#f9f9f9;border-left:4px solid ${BRAND_COLOR};padding:1rem 1.25rem;margin:1.25rem 0;border-radius:0 8px 8px 0;font-size:15px;color:#333;font-style:italic">"${d.comment}"</div>` : ''}
      ${cta('View Listing', d.link || SITE_URL + '/browse.html')}
    `),
  }),

  welcome: (d) => ({
    subject: `👋 Welcome to Vendio, ${d.toName}!`,
    html: layout(`
      <h2>Welcome to Vendio! 🎉</h2>
      <p>Hi <strong>${d.toName}</strong>,</p>
      <p>Your account is set up and ready to go. Here's what you can do:</p>
      <div style="display:grid;gap:12px;margin:1.5rem 0">
        <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:1rem">🛒 <strong>Browse listings</strong> — explore thousands of products, services and skills</div>
        <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:1rem">🏪 <strong>Start selling</strong> — list your products or services in minutes</div>
        <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:1rem">🔒 <strong>Escrow protection</strong> — every transaction is secured</div>
      </div>
      ${cta('Explore Vendio', SITE_URL + '/browse.html')}
    `),
  }),
};

/* ── HTML Layout ── */
function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Vendio</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:${BRAND_DARK};padding:24px 32px;display:flex;align-items:center;gap:8px">
      <span style="font-size:22px;font-weight:700;color:#fff;font-family:Georgia,serif;letter-spacing:-0.02em">Vendio</span>
      <span style="width:7px;height:7px;border-radius:50%;background:${BRAND_COLOR};display:inline-block"></span>
    </div>
    <!-- Content -->
    <div style="padding:32px;color:#111;line-height:1.6">
      <style>
        h2 { font-family: Georgia, serif; font-size: 22px; margin: 0 0 16px; color: #111; letter-spacing: -0.02em; }
        p  { font-size: 15px; color: #444; margin: 0 0 12px; }
        strong { color: #111; }
      </style>
      ${content}
    </div>
    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 6px">
        You're receiving this because you have a Vendio account.
      </p>
      <p style="font-size:12px;color:#9ca3af;margin:0">
        <a href="${SITE_URL}" style="color:${BRAND_COLOR};text-decoration:none">vendio.com</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}/account-recovery.html" style="color:#9ca3af;text-decoration:none">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function infoBox(rows: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:1.25rem 0;font-size:14px">
    ${rows.map(([label, value]) => `
      <tr>
        <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280;font-weight:500;width:35%">${label}</td>
        <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;color:#111;font-weight:500">${value || '—'}</td>
      </tr>`).join('')}
  </table>`;
}

function cta(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0">
    <a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:${BRAND_DARK};font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;letter-spacing:0.01em">${label} →</a>
  </div>`;
}

/* ── Handler ── */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  try {
    const body = await req.json();
    const { type, to, ...data } = body;

    if (!type || !to) {
      return new Response(JSON.stringify({ error: 'Missing type or to' }), { status: 400 });
    }

    const template = templates[type];
    if (!template) {
      return new Response(JSON.stringify({ error: `Unknown template: ${type}` }), { status: 400 });
    }

    const { subject, html } = template(data);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [to],
        subject: subject,
        html:    html,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: result }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
