/*
  ============================================================
  auth.guard.js — VENDIO SESSION GUARD
  Include on EVERY page. Handles:

  1. HARD GUARD  — page requires login (dashboards, checkout)
     Call: AuthGuard.require()
     → Redirects to login immediately if no session
     → No flash, no content shown

  2. SOFT GUARD  — page is public but some actions need login
     Call: AuthGuard.protectAction(callback, label)
     → Runs callback if logged in
     → Shows modal prompt if guest, then redirects after login

  3. NAV SYNC    — shows correct nav state (logged in vs guest)
     Call: AuthGuard.syncNav(options)

  4. SESSION GET — get current user anywhere
     Call: await AuthGuard.user()
  ============================================================
*/

;(function() {
if (!window._gSb) {
  window._gSb = supabase.createClient(
    'https://rtwbrcbifnowrqpgivma.supabase.co',
    'sb_publishable_ydvrDDChpJ-pkeDLZlcJyA_Qqk0OUd7'
  );
}

(function () {
  const { createClient } = supabase;
  const _sb = window._gSb;

  /* cached user so we only fetch once per page */
  let _user = undefined;

  async function getUser() {
    if (_user !== undefined) return _user;
    try {
      const { data: { user } } = await _sb.auth.getUser();
      _user = user || null;
    } catch {
      _user = null;
    }
    return _user;
  }

  /* ── HARD GUARD ─────────────────────────────────────────
     Call at top of init() on protected pages.
     Hides the whole page until session is confirmed.
     If no session → save return URL → redirect to login.
  ───────────────────────────────────────────────────────── */
  async function require(returnTo) {
    /* hide body immediately to prevent flash */
    document.body.style.visibility = 'hidden';

    const user = await getUser();
    if (!user) {
      const dest = returnTo || window.location.pathname + window.location.search;
      sessionStorage.setItem('vendio_return_to', dest);
      window.location.replace('vendio-auth.html');
      return null;
    }

    document.body.style.visibility = '';
    return user;
  }

  /* ── SOFT GUARD ──────────────────────────────────────────
     For protected actions on public pages (save, contact, buy).
     If logged in → runs callback immediately.
     If guest     → saves return URL + shows inline modal prompt.
  ───────────────────────────────────────────────────────── */
  async function protectAction(callback, { label = 'do that', returnTo } = {}) {
    const user = await getUser();
    if (user) { callback(user); return; }

    /* save where to return after login */
    const dest = returnTo || window.location.href;
    sessionStorage.setItem('vendio_return_to', dest);

    showAuthPrompt(label);
  }

  /* ── AUTH PROMPT MODAL ───────────────────────────────────
     Inline modal shown when guest tries a protected action.
  ───────────────────────────────────────────────────────── */
  function showAuthPrompt(label = 'do that') {
    /* remove existing */
    document.getElementById('_ag_modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_ag_modal';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);
      display:flex;align-items:center;justify-content:center;padding:1.25rem;
      animation:_agFadeIn 0.2s ease;
    `;

    overlay.innerHTML = `
      <style>
        @keyframes _agFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes _agSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        #_ag_box { animation: _agSlideUp 0.25s ease; }
      </style>
      <div id="_ag_box" style="
        background:#0f0f0f;border:1px solid rgba(255,255,255,0.11);
        border-radius:18px;width:100%;max-width:400px;padding:2rem;
        text-align:center;position:relative;
      ">
        <button id="_ag_close" style="
          position:absolute;top:1rem;right:1rem;
          background:#141414;border:1px solid rgba(255,255,255,0.07);
          color:rgba(255,255,255,0.45);width:30px;height:30px;
          border-radius:7px;font-size:0.85rem;cursor:pointer;
          display:flex;align-items:center;justify-content:center;
        "><i class="fas fa-xmark"></i></button>

        <div style="font-size:2.5rem;margin-bottom:1rem"><i class="fas fa-lock"></i></div>
        <h2 style="
          font-family:'Playfair Display',Georgia,serif;
          font-size:1.35rem;font-weight:700;color:#fff;
          margin-bottom:0.5rem;letter-spacing:-0.02em;
        ">Sign in to ${label}</h2>
        <p style="
          color:rgba(255,255,255,0.45);font-size:0.85rem;
          line-height:1.65;margin-bottom:1.75rem;
          font-family:'DM Sans',system-ui,sans-serif;
        ">
          You need a free Vendio account to continue.<br>
          It only takes 30 seconds to sign up.
        </p>

        <div style="display:flex;flex-direction:column;gap:0.65rem;">
          <button id="_ag_signup" style="
            width:100%;padding:0.88rem;
            background:#F59E0B;border:none;border-radius:10px;
            color:#0a0a0a;font-size:0.92rem;font-weight:700;
            cursor:pointer;transition:background 0.2s;
            font-family:'DM Sans',system-ui,sans-serif;
          ">Create Free Account →</button>
          <button id="_ag_login" style="
            width:100%;padding:0.88rem;
            background:transparent;border:1px solid rgba(255,255,255,0.11);
            border-radius:10px;color:#fff;font-size:0.88rem;
            cursor:pointer;transition:all 0.2s;
            font-family:'DM Sans',system-ui,sans-serif;
          ">Log In to Existing Account</button>
        </div>

        <p style="
          margin-top:1.25rem;font-size:0.75rem;
          color:rgba(255,255,255,0.22);
          font-family:'DM Sans',system-ui,sans-serif;
        ">
          Free forever · No credit card required
        </p>
      </div>`;

    document.body.appendChild(overlay);

    /* events */
    document.getElementById('_ag_close').onclick  = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('_ag_signup').onclick = () => {
      window.location.href = 'vendio-auth.html#signup';
    };
    document.getElementById('_ag_login').onclick = () => {
      window.location.href = 'vendio-auth.html';
    };
    document.getElementById('_ag_signup').onmouseover = function() { this.style.background='#FBBF24'; };
    document.getElementById('_ag_signup').onmouseout  = function() { this.style.background='#F59E0B'; };
    document.getElementById('_ag_login').onmouseover  = function() { this.style.borderColor='rgba(255,255,255,0.2)'; };
    document.getElementById('_ag_login').onmouseout   = function() { this.style.borderColor='rgba(255,255,255,0.11)'; };
  }

  /* ── NAV SYNC ────────────────────────────────────────────
     Updates nav based on session state.
     Pass element IDs to show/hide based on auth state.
  ───────────────────────────────────────────────────────── */
  async function syncNav({ 
    guestEls   = [],   /* IDs to show when logged out */
    authEls    = [],   /* IDs to show when logged in  */
    avatarEl   = null, /* ID of avatar element        */
    nameEl     = null, /* ID of name element          */
    logoutEl   = null, /* ID of logout button         */
  } = {}) {
    const user = await getUser();

    guestEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = user ? 'none' : '';
    });

    authEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = user ? '' : 'none';
    });

    if (avatarEl && user) {
      const el = document.getElementById(avatarEl);
      if (el) {
        const name = user.user_metadata?.full_name || user.email || '';
        el.textContent = name[0]?.toUpperCase() || 'U';
        el.title = name;
        el.style.cursor = 'pointer';
        el.onclick = () => { window.location.href = 'dashboard-buyer.html'; };
      }
    }

    if (nameEl && user) {
      const el = document.getElementById(nameEl);
      if (el) el.textContent = user.user_metadata?.full_name?.split(' ')[0] || 'Account';
    }

    if (logoutEl && user) {
      const el = document.getElementById(logoutEl);
      if (el) el.onclick = async () => { await _sb.auth.signOut(); window.location.reload(); };
    }

    return user;
  }

  /* ── expose ── */
  window.AuthGuard = { require, protectAction, syncNav, user: getUser, showAuthPrompt };
})();

})(); /* end auth.guard.js IIFE */