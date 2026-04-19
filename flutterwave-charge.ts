/*
  ============================================================
  TraydR — Flutterwave v3 LIVE Edge Function
  
  SECRETS in Supabase Dashboard → Edge Functions → Secrets:
  FLW_SECRET_KEY   = FLWSECK-ff5824afce8051a95505864cd70a1ffc-19d7b5af6c9vt-X
  FLW_WEBHOOK_HASH = #2026@Boss...1234/TraydrHQ/$Emmanuel, Jonah, Ephraim
  ============================================================
*/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FLW_SECRET_KEY  = Deno.env.get('FLW_SECRET_KEY')           ?? '';
const FLW_WEBHOOK_HASH= Deno.env.get('FLW_WEBHOOK_HASH')         ?? '';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_SVC    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: object, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

async function flwPost(endpoint: string, body: object) {
  const res = await fetch(`https://api.flutterwave.com/v3${endpoint}`, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${FLW_SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`FLW POST ${endpoint} [${res.status}]:`, text.slice(0, 500));
  try { return JSON.parse(text); } catch { return { status: 'error', message: text }; }
}

async function flwGet(endpoint: string) {
  const res = await fetch(`https://api.flutterwave.com/v3${endpoint}`, {
    headers: { 'Authorization': `Bearer ${FLW_SECRET_KEY}` },
  });
  const text = await res.text();
  console.log(`FLW GET ${endpoint} [${res.status}]:`, text.slice(0, 500));
  try { return JSON.parse(text); } catch { return { status: 'error', message: text }; }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  /* ── Flutterwave Webhook (server-to-server) ── */
  const hashHeader = req.headers.get('verif-hash');
  if (hashHeader) {
    if (FLW_WEBHOOK_HASH && hashHeader !== FLW_WEBHOOK_HASH) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    console.log('Webhook received:', JSON.stringify(body).slice(0, 300));
    const { event, data: ev } = body;
    if (event === 'charge.completed' && ev?.status === 'successful') {
      const sb = createClient(SUPABASE_URL, SUPABASE_SVC);
      const txRef = (ev.tx_ref as string) || '';
      const { data: orders } = await sb
        .from('orders').select('id')
        .eq('payment_ref', txRef).limit(1);
      if (orders?.[0]) {
        await sb.from('orders').update({
          status        : 'escrowed',
          payment_method: 'flutterwave',
          paid_at       : new Date().toISOString(),
        }).eq('id', orders[0].id);
        console.log('Order escrowed via webhook:', orders[0].id);
      }
    }
    return json({ received: true });
  }

  /* ── JSON body ── */
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const action = (body.action as string) || '';
  console.log('Action:', action, '| Key configured:', FLW_SECRET_KEY ? 'YES ✅' : 'NO ❌');

  /* ══════════════════════════════════════════
     INITIATE — generate Flutterwave payment link
  ══════════════════════════════════════════ */
  if (action === 'initiate') {
    const { amount, currency, email, name, phone, listing_title, redirect_url } =
      body as Record<string, string>;

    if (!amount || !email) {
      return json({ success: false, error: 'amount and email are required' }, 400);
    }
    if (!FLW_SECRET_KEY) {
      return json({ success: false, error: 'FLW_SECRET_KEY not set in Supabase secrets' }, 500);
    }

    const tx_ref = `TRADDR-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const cur    = (currency || 'NGN').toUpperCase();

    const paymentOptions: Record<string,string> = {
      NGN: 'card,banktransfer,ussd,mobilemoneynigeria',
      GHS: 'card,mobilemoneymomo',
      KES: 'card,mpesa',
      ZAR: 'card',
      USD: 'card',
      GBP: 'card',
      EUR: 'card',
    };

    const result = await flwPost('/payments', {
      tx_ref,
      amount        : Number(amount),
      currency      : cur,
      redirect_url  : redirect_url || 'https://traydr.vercel.app/checkout.html?flw=success',
      customer      : {
        email,
        name       : name  || 'TraydR Buyer',
        phonenumber: phone || '',
      },
      customizations: {
        title      : 'TraydR Marketplace',
        description: (listing_title as string) || 'Secure Payment',
        logo       : 'https://traydr.vercel.app/logo.png',
      },
      payment_options: paymentOptions[cur] || 'card',
    });

    if (result.status === 'success' && result.data?.link) {
      return json({ success: true, payment_link: result.data.link, tx_ref });
    }

    return json({
      success: false,
      error  : result.message || 'Flutterwave did not return a payment link',
      detail : result,
    }, 400);
  }

  /* ══════════════════════════════════════════
     VERIFY — verify after Flutterwave redirect
     Creates order in DB after confirmed payment
  ══════════════════════════════════════════ */
  if (action === 'verify') {
    const { transaction_id, tx_ref, checkout_data } = body as Record<string, unknown>;

    if (!transaction_id) {
      return json({ success: false, error: 'transaction_id is required' }, 400);
    }

    const result = await flwGet(`/transactions/${transaction_id}/verify`);

    const isSuccess =
      result.status === 'success'          &&
      result.data?.status === 'successful' &&
      result.data?.tx_ref === tx_ref;

    if (isSuccess) {
      const paid         = result.data.amount as number;
      const currency     = result.data.currency as string;
      const flwRef       = result.data.flw_ref as string;
      const platformFee  = +(paid * 0.08).toFixed(2);
      const sellerPayout = +(paid * 0.92).toFixed(2);

      const sb = createClient(SUPABASE_URL, SUPABASE_SVC);
      let orderId: number | null = null;
      const cd = checkout_data as Record<string, unknown> | null;

      if (cd?.buyer_id) {
        const { data: order, error: oErr } = await sb
          .from('orders')
          .insert({
            buyer_id      : cd.buyer_id,
            seller_id     : cd.seller_id,
            listing_id    : cd.listing_id,
            listing_title : cd.listing_title,
            listing_image : cd.listing_image,
            seller_name   : cd.seller_name,
            buyer_name    : cd.buyer_name,
            amount        : paid,
            platform_fee  : platformFee,
            seller_payout : sellerPayout,
            package_label : cd.package_label,
            status        : 'escrowed',
            payment_ref   : flwRef,
            payment_method: 'flutterwave',
            paid_at       : new Date().toISOString(),
          })
          .select().single();

        if (oErr) {
          console.error('Order insert error:', JSON.stringify(oErr));
        } else {
          orderId = order?.id;
          console.log('✅ Order created successfully:', orderId);

          if (cd.seller_id) {
            await sb.from('notifications').insert({
              user_id: cd.seller_id,
              type   : 'order',
              title  : 'New Order Received! 🎉',
              message: `${cd.buyer_name} purchased "${cd.listing_title}". Funds in escrow.`,
              link   : '/dashboard-seller.html',
            });
          }
        }
      }

      return json({
        success      : true,
        status       : 'escrowed',
        order_id     : orderId,
        amount       : paid,
        currency,
        platform_fee : platformFee,
        seller_payout: sellerPayout,
        flw_ref      : flwRef,
      });
    }

    return json({
      success: false,
      error  : 'Payment verification failed',
      status : result.data?.status || 'unknown',
      detail : result,
    }, 400);
  }

  return json({ error: `Unknown action "${action}"` }, 400);
});
