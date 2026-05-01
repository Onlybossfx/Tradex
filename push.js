/* ══════════════════════════════════════════════════════
   TraydR Push Notifications — VAPID enabled
   Include this script on dashboard pages:
   <script src="push.js"></script>

   VAPID Public Key is embedded here (safe to expose)
   Private key stays on the server (quick-api Edge Function)
══════════════════════════════════════════════════════ */

const VAPID_PUBLIC_KEY = 'BN7ih6Yzmq6cmQNkd-EROcLQIhNzP-DtmFCUyph1CI0D9e5wZi1mGnRTc3lGW1kqE0HkyUbTZphwGGN4PtTYvDE';
const SUPA_URL  = 'https://rtwbrcbifnowrqpgivma.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0d2JyY2JpZm5vd3JxcGdpdm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjQwODUsImV4cCI6MjA4OTUwMDA4NX0.v_jTy9b0hi1I8X8FtSSnWlMty_D60FvnMiiKikdIGgc';

/* Convert VAPID base64 key to Uint8Array for pushManager */
function urlBase64ToUint8(base64) {
  const pad  = '='.repeat((4 - base64.length % 4) % 4);
  const b64  = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

window.PushNotif = {

  /* ── Ask permission + subscribe ── */
  subscribe: async (userId) => {
    if (!('Notification' in window))      return console.warn('[push] Not supported');
    if (!('serviceWorker' in navigator))  return console.warn('[push] No SW');
    if (Notification.permission === 'denied') return;

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { console.log('[push] Permission denied'); return; }

    try {
      const reg = await navigator.serviceWorker.ready;
      /* Check if already subscribed */
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC_KEY),
        });
      }

      /* Save subscription to Supabase so server can send pushes */
      if (userId && sub) {
        const { endpoint, keys } = sub.toJSON();
        await fetch(`${SUPA_URL}/rest/v1/push_subscriptions`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPA_ANON,
            'Authorization': `Bearer ${SUPA_ANON}`,
            'Prefer':        'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            user_id:  userId,
            endpoint,
            p256dh:   keys?.p256dh   || '',
            auth_key: keys?.auth     || '',
          }),
        });
        console.log('[push] Subscribed + saved to DB');
      }

      localStorage.setItem('traydr_push_ok', '1');
    } catch(e) {
      console.warn('[push] Subscribe failed:', e.message);
    }
  },

  /* ── Show local notification via SW ── */
  show: async (title, body, url = '/') => {
    if (Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon:      '/logo.png',
        badge:     '/logo.png',
        tag:       'traydr-' + Date.now(),
        renotify:  true,
        data:      { url },
        actions:   [{ action: 'open', title: 'View' }],
      });
    } catch(e) {
      /* Fallback */
      try { new Notification(title, { body, icon: '/logo.png' }); } catch {}
    }
  },

  /* ── Event helpers ── */
  onNewOrder:    (ref)    => PushNotif.show('New Order! 🎉',           `Order ${ref} received — funds in escrow.`,  '/dashboard-seller.html'),
  onNewMessage:  (name)   => PushNotif.show(`Message from ${name}`,    'You have a new message on TraydR.',          '/dashboard-seller.html'),
  onOrderUpdate: (status, ref) => PushNotif.show(`Order ${status}`,    `Order ${ref} — tap to view details.`,       '/dashboard-buyer.html'),
  onNewProposal: (title)  => PushNotif.show('New Proposal Received 📬', `Someone applied to: ${title}`,             '/dashboard-seller.html'),
  onPayout:      (amount) => PushNotif.show('Payout Processed 💰',     `${amount} has been sent to your account.`, '/dashboard-seller.html'),
};
