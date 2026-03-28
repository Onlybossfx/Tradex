/*
  ============================================================
  auth.backend.js — VENDIO AUTH BACKEND
  Supabase implementation for all 3 auth pages.

  SETUP:
  1. In each auth HTML file, add before </body>:
       <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
       <script src="auth.backend.js"></script>

  2. Fill in your Supabase credentials below.
     Find them at: https://app.supabase.com → Settings → API

  PAGES THAT USE THIS FILE:
    vendio-auth.html      → login, signup, OAuth
    2fa.html              → verifyOtp, resendOtp
    account-recovery.html → forgotPassword, updatePassword
  ============================================================
*/

  /* ── Config ── */
;(function() {
const _AUTH_URL  = window._AUTH_URL  || 'https://rtwbrcbifnowrqpgivma.supabase.co';
const _AUTH_ANON = window._AUTH_ANON || 'sb_publishable_ydvrDDChpJ-pkeDLZlcJyA_Qqk0OUd7';

const { createClient } = supabase;
const sb = createClient(_AUTH_URL, _AUTH_ANON);

/* ── Base URL — works on localhost AND GitHub Pages ── */
const BASE_URL = (() => {
  const origin = window.location.origin;
  const path   = window.location.pathname;
  const parts  = path.split('/').filter(Boolean);
  /* GitHub Pages serves from /RepoName/ subfolder */
  if (origin.includes('github.io') && parts.length > 0) {
    return `${origin}/${parts[0]}`;
  }
  return origin;
})();

window.Auth = {

  /* ─────────────────────────────────────────────
     LOGIN
     Called by: vendio-auth.html
     On success → frontend redirects to 2fa.html
  ───────────────────────────────────────────── */
  login: async (email, password) => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return { error };
  },

  /* ─────────────────────────────────────────────
     SIGNUP
     Called by: vendio-auth.html (step 2)
     Saves role + name to users table.
     On success → frontend moves to step 3 (2FA setup)
  ───────────────────────────────────────────── */
  signup: async (email, password, meta) => {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: `${BASE_URL}/vendio-auth.html?confirmed=1`,
      },
    });

    if (error || !data.user) return { error };

    const { error: dbError } = await sb
      .from('users')
      .insert({
        id:        data.user.id,
        email:     data.user.email,
        full_name: meta.full_name,
        role:      meta.role,
      });

    /* Welcome email — fire and forget */
    try {
      fetch(`${_AUTH_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({
          type:   'welcome',
          to:     email,
          toName: meta.full_name || email.split('@')[0],
        }),
      });
    } catch(e) {}

    return { error: dbError };
  },

  /* ─────────────────────────────────────────────
     OAUTH LOGIN
     Called by: vendio-auth.html
     Supabase handles the redirect automatically.
  ───────────────────────────────────────────── */
  loginWithOAuth: async (provider) => {
    await sb.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${BASE_URL}/vendio-auth.html?oauth=1`,
      },
    });
  },

  /* ─────────────────────────────────────────────
     VERIFY OTP
     Called by: 2fa.html
     Verifies 6-digit email or SMS code.
  ───────────────────────────────────────────── */
  verifyOtp: async (email, token, context = 'login') => {
    /* type must match what was sent:
       signup flow  → 'signup'
       login/other  → 'email'  */
    const type = context === 'signup' ? 'signup' : 'email';
    const { error } = await sb.auth.verifyOtp({
      email,
      token,
      type,
    });
    return { error };
  },

  /* ─────────────────────────────────────────────
     RESEND OTP
     Called by: 2fa.html
  ───────────────────────────────────────────── */
  resendOtp: async (email, context = 'login') => {
    const type = context === 'signup' ? 'signup' : 'email';
    const { error } = await sb.auth.resend({
      type,
      email,
    });
    return { error };
  },

  /* ─────────────────────────────────────────────
     FORGOT PASSWORD
     Called by: account-recovery.html (step 1)
     Sends reset email with link back to account-recovery.html
  ───────────────────────────────────────────── */
  forgotPassword: async (email) => {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${BASE_URL}/account-recovery.html`,
    });
    return { error };
  },

  /* ─────────────────────────────────────────────
     UPDATE PASSWORD
     Called by: account-recovery.html (step 3)
     User has arrived via the reset email link.
     Supabase auto-sets the session from the URL token.
  ───────────────────────────────────────────── */
  updatePassword: async (newPassword) => {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    return { error };
  },

  /* ─────────────────────────────────────────────
     ON SUCCESS
     Called after: login, signup, OTP verify, password reset
     Redirects user based on context.
  ───────────────────────────────────────────── */
  onSuccess: async ({ context, role }) => {
    /* ── Always check for a pending return destination first ── */
    const returnTo = sessionStorage.getItem('vendio_return_to');
    if (returnTo) {
      sessionStorage.removeItem('vendio_return_to');
      window.location.href = returnTo;
      return;
    }

    /* Also handle legacy checkout redirect */
    if (sessionStorage.getItem('vendio_checkout') && context === 'login') {
      window.location.href = 'checkout.html';
      return;
    }

    if (context === 'signup') {
      window.location.href = (role === 'seller' || role === 'both')
        ? 'dashboard-seller.html'
        : 'dashboard-buyer.html';
      return;
    }

    if (context === 'passwordReset') {
      window.location.href = 'account-recovery.html?reset=1';
      return;
    }

    /* Login — read role from users table */
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: profile } = await sb
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        const userRole = profile?.role || user.user_metadata?.role || 'buyer';
        window.location.href = (userRole === 'seller' || userRole === 'both')
          ? 'dashboard-seller.html'
          : 'dashboard-buyer.html';
        return;
      }
    } catch(e) {}

    window.location.href = 'dashboard-buyer.html';
  },

};

})(); /* end auth.backend.js IIFE */