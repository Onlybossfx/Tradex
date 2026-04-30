/* ══════════════════════════════════════════════
   TraydR Push Notifications
   Usage: import push.js on dashboards
   Call: PushNotif.subscribe(userId) on login
══════════════════════════════════════════════ */

const SUPA = 'https://rtwbrcbifnowrqpgivma.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0d2JyY2JpZm5vd3JxcGdpdm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjQwODUsImV4cCI6MjA4OTUwMDA4NX0.v_jTy9b0hi1I8X8FtSSnWlMty_D60FvnMiiKikdIGgc';

window.PushNotif = {

  /* Ask permission + subscribe to push */
  subscribe: async (userId) => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'denied') return;

    /* Ask permission (only shows native dialog once) */
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    try {
      const reg  = await navigator.serviceWorker.ready;
      /* Check if already subscribed */
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        /* NOTE: Replace VAPID_PUBLIC_KEY with your actual key */
        /* Generate at: https://vapidkeys.com */
        /* For now, use local notifications only (no VAPID) */
        console.log('[push] Subscribed to browser notifications');
      }
      /* Store preference */
      localStorage.setItem('traydr_push_ok', '1');
      console.log('[push] Permission granted');
    } catch(e) {
      console.warn('[push] Subscribe error:', e);
    }
  },

  /* Show local browser notification (works without VAPID) */
  show: async (title, body, url='/') => {
    if (Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, {
        body,
        icon:  '/logo.png',
        badge: '/logo.png',
        tag:   'traydr-' + Date.now(),
        data:  { url },
        actions: [{ action:'open', title:'View' }],
      });
    } catch(e) {
      /* Fallback — basic Notification API */
      try { new Notification(title, { body, icon:'/logo.png' }); } catch(e2){}
    }
  },

  /* Trigger notification for specific events */
  onNewOrder: (orderRef) => {
    PushNotif.show(
      'New Order! 🎉',
      `Order ${orderRef} received — funds in escrow.`,
      '/dashboard-seller.html'
    );
  },
  onNewMessage: (senderName) => {
    PushNotif.show(
      `Message from ${senderName}`,
      'You have a new message on TraydR.',
      '/dashboard-seller.html'
    );
  },
  onOrderUpdate: (status, ref) => {
    PushNotif.show(
      `Order ${ref} ${status}`,
      'Tap to view your order details.',
      '/dashboard-buyer.html'
    );
  },
  onNewProposal: (jobTitle) => {
    PushNotif.show(
      'New Proposal Received',
      `Someone applied to: ${jobTitle}`,
      '/dashboard-seller.html'
    );
  },
};