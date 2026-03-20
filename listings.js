/*
  ============================================================
  listings.js — SHARED DATA LAYER
  Used by: browse.html, listing.html, tradex.html

  Connects to Supabase listings table.
  All pages import this via:
    <script src="listings.js"></script>

  Then call:
    await Listings.getAll(filters)
    await Listings.getById(id)
    await Listings.search(query)
    await Listings.getFeatured()
    await Listings.getRelated(category, excludeId)
    await Listings.save(listingId)
    await Listings.unsave(listingId)
    await Listings.getSaved()
  ============================================================
*/

const SUPABASE_URL  = 'https://rtwbrcbifnowrqpgivma.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ydvrDDChpJ-pkeDLZlcJyA_Qqk0OUd7';

const { createClient } = supabase;
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON);

window.Listings = {

  /* ─────────────────────────────────────────────
     GET ALL — with filters, sort, pagination
     Used by: browse.html
  ───────────────────────────────────────────── */
  getAll: async ({ category, priceMin, priceMax, rating, days, verified, sort, page, perPage, search } = {}) => {
    try {
      let query = _sb
        .from('listings')
        .select('*', { count: 'exact' })
        .eq('status', 'active');

      /* category */
      if (category && category !== 'all') query = query.eq('category', category);

      /* price */
      if (priceMin) query = query.gte('price', priceMin);
      if (priceMax) query = query.lte('price', priceMax);

      /* rating */
      if (rating && rating > 0) query = query.gte('rating', rating);

      /* delivery */
      if (days && days > 0) query = query.lte('delivery_days', days);

      /* verified */
      if (verified === 'true') query = query.eq('seller_verified', true);

      /* search — title, description, seller_name, tags */
      if (search && search.trim()) {
        query = query.or(
          `title.ilike.%${search}%,description.ilike.%${search}%,seller_name.ilike.%${search}%`
        );
      }

      /* sort */
      if (sort === 'price_asc')  query = query.order('price', { ascending: true });
      if (sort === 'price_desc') query = query.order('price', { ascending: false });
      if (sort === 'rating')     query = query.order('rating', { ascending: false });
      if (sort === 'popular')    query = query.order('order_count', { ascending: false });
      if (!sort || sort === 'newest') query = query.order('created_at', { ascending: false });

      /* pagination */
      const _page    = page    || 1;
      const _perPage = perPage || 12;
      const from     = (_page - 1) * _perPage;
      const to       = from + _perPage - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;
      return { data: data || [], count: count || 0, error: null };
    } catch (error) {
      console.error('[Listings.getAll]', error);
      return { data: [], count: 0, error };
    }
  },

  /* ─────────────────────────────────────────────
     GET BY ID — full listing detail
     Used by: listing.html
  ───────────────────────────────────────────── */
  getById: async (id) => {
    try {
      const { data, error } = await _sb
        .from('listings')
        .select('*')
        .eq('id', id)
        .eq('status', 'active')
        .single();
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[Listings.getById]', error);
      return { data: null, error };
    }
  },

  /* ─────────────────────────────────────────────
     SEARCH — full text search
     Used by: browse.html, nav search
  ───────────────────────────────────────────── */
  search: async (query, limit = 12) => {
    try {
      const { data, error } = await _sb
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%,seller_name.ilike.%${query}%`)
        .order('rating', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[Listings.search]', error);
      return { data: [], error };
    }
  },

  /* ─────────────────────────────────────────────
     GET FEATURED — for landing page
     Used by: tradex.html
  ───────────────────────────────────────────── */
  getFeatured: async (limit = 6) => {
    try {
      const { data, error } = await _sb
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .eq('featured', true)
        .order('order_count', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[Listings.getFeatured]', error);
      return { data: [], error };
    }
  },

  /* ─────────────────────────────────────────────
     GET RELATED — same category, different listing
     Used by: listing.html
  ───────────────────────────────────────────── */
  getRelated: async (category, excludeId, limit = 4) => {
    try {
      const { data, error } = await _sb
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .eq('category', category)
        .neq('id', excludeId)
        .order('rating', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[Listings.getRelated]', error);
      return { data: [], error };
    }
  },

  /* ─────────────────────────────────────────────
     GET CATEGORY COUNTS — for sidebar filters
     Used by: browse.html
  ───────────────────────────────────────────── */
  getCounts: async () => {
    try {
      const { data, error } = await _sb
        .from('listings')
        .select('category')
        .eq('status', 'active');
      if (error) throw error;
      const counts = { all: 0, physical: 0, digital: 0, freelance: 0, experience: 0 };
      (data || []).forEach(l => {
        counts.all++;
        if (counts[l.category] !== undefined) counts[l.category]++;
      });
      return { data: counts, error: null };
    } catch (error) {
      console.error('[Listings.getCounts]', error);
      return { data: null, error };
    }
  },

  /* ─────────────────────────────────────────────
     SAVE LISTING
     Used by: browse.html, listing.html
  ───────────────────────────────────────────── */
  save: async (listingId) => {
    try {
      const { data: { user } } = await _sb.auth.getUser();
      if (!user) return { error: { message: 'Please log in to save listings.' } };
      const { error } = await _sb.from('saved_listings').insert({ user_id: user.id, listing_id: listingId });
      return { error };
    } catch (error) {
      return { error };
    }
  },

  /* ─────────────────────────────────────────────
     UNSAVE LISTING
  ───────────────────────────────────────────── */
  unsave: async (listingId) => {
    try {
      const { data: { user } } = await _sb.auth.getUser();
      if (!user) return { error: { message: 'Please log in.' } };
      const { error } = await _sb.from('saved_listings').delete().eq('user_id', user.id).eq('listing_id', listingId);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  /* ─────────────────────────────────────────────
     GET SAVED — all saved listings for current user
  ───────────────────────────────────────────── */
  getSaved: async () => {
    try {
      const { data: { user } } = await _sb.auth.getUser();
      if (!user) return { data: [], error: null };
      const { data, error } = await _sb
        .from('saved_listings')
        .select('listing_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return { data: (data || []).map(r => r.listing_id), error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  /* ─────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────── */

  /* Get first image or fallback */
  getImage: (listing, index = 0) => {
    if (listing?.images && listing.images.length > index) {
      return listing.images[index];
    }
    return `https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80`;
  },

  /* Badge label */
  getBadgeLabel: (badge) => {
    const map = { top: 'Top Seller', best: 'Bestseller', new: 'New', verified: 'Verified' };
    return map[badge] || '';
  },

  /* Badge CSS class */
  getBadgeClass: (badge) => {
    const map = { top: 'badge-top', best: 'badge-best', new: 'badge-new', verified: 'badge-ver' };
    return map[badge] || '';
  },

  /* Category display name */
  getCatName: (category) => {
    const map = { physical: 'Physical Goods', digital: 'Digital Products', freelance: 'Freelance Skills', experience: 'Experiences' };
    return map[category] || category;
  },

  /* Category emoji */
  getCatEmoji: (category) => {
    const map = { physical: '📦', digital: '💾', freelance: '🛠️', experience: '🎓' };
    return map[category] || '🏪';
  },

  /* Star string */
  getStars: (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? '½' : '';
    return '★'.repeat(full) + half;
  },

};

/* ─── Injected methods ─── */
(function() {
  const extra = {

    getSellerProfile: async (sellerId) => {
      if (!sellerId) return { data: null, error: null };
      try {
        const { data, error } = await _sb
          .from('users')
          .select('id, full_name, avatar_url, location, bio, verified, created_at, role')
          .eq('id', sellerId)
          .single();
        if (error) return { data: null, error };
        const { data: lList } = await _sb
          .from('listings')
          .select('id, rating, review_count, order_count')
          .eq('seller_id', sellerId)
          .eq('status', 'active');
        const ls = lList || [];
        return {
          data: {
            ...data,
            totalOrders:   ls.reduce((s,l)=>s+(l.order_count||0),0),
            avgRating:     ls.length ? (ls.reduce((s,l)=>s+(l.rating||0),0)/ls.length).toFixed(1) : '—',
            totalReviews:  ls.reduce((s,l)=>s+(l.review_count||0),0),
            totalListings: ls.length,
            memberSince:   new Date(data.created_at).toLocaleDateString('en-GB',{month:'short',year:'numeric'}),
          },
          error: null,
        };
      } catch(e) { return { data: null, error: e }; }
    },

    getListingReviews: async (listingId) => {
      try {
        const { data, error } = await _sb
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer_id, users(full_name, avatar_url)')
          .eq('listing_id', listingId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return { data: data || [], error: null };
      } catch(e) { return { data: [], error: e }; }
    },

    getSellerListings: async (sellerId, excludeId, limit = 4) => {
      if (!sellerId) return { data: [], error: null };
      try {
        const { data, error } = await _sb
          .from('listings')
          .select('id, title, images, price, rating, review_count, category')
          .eq('seller_id', sellerId)
          .eq('status', 'active')
          .neq('id', excludeId)
          .order('order_count', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return { data: data || [], error: null };
      } catch(e) { return { data: [], error: e }; }
    },

  };
  Object.assign(window.Listings, extra);
})();

/* ── View tracking ── */
Object.assign(window.Listings, {
  trackView: async (listingId) => {
    try {
      /* fire and forget — non-blocking */
      const { data: { user } } = await _sb.auth.getUser().catch(() => ({ data: { user: null } }));
      _sb.rpc('increment_listing_view', { listing_id_arg: listingId }).catch(() => {});
      _sb.from('listing_views').insert({ listing_id: listingId, viewer_id: user?.id || null }).catch(() => {});
    } catch {}
  },
});
