/*
  listings.js — TRADEX DATA LAYER
  Uses window pattern to avoid duplicate const errors
*/
if (!window._lSb) {
  window._lSb = supabase.createClient(
    'https://rtwbrcbifnowrqpgivma.supabase.co',
    'sb_publishable_ydvrDDChpJ-pkeDLZlcJyA_Qqk0OUd7'
  );
}

window.Listings = {

  /* ── GET ALL — browse page ── */
  getAll: async ({ category, priceMin, priceMax, rating, days, verified, sort, page, perPage, search } = {}) => {
    try {
      let query = window._lSb
        .from('listings')
        .select('*', { count: 'exact' })
        .eq('status', 'active');

      if (category && category !== 'all') query = query.eq('category', category);
      if (priceMin)  query = query.gte('price', priceMin);
      if (priceMax)  query = query.lte('price', priceMax);
      if (rating && rating > 0) query = query.gte('rating', rating);
      if (days && days > 0)     query = query.lte('delivery_days', days);
      if (verified === 'true')  query = query.eq('seller_verified', true);

      if (search && search.trim()) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,seller_name.ilike.%${search}%`);
      }

      if (sort === 'price_asc')  query = query.order('price', { ascending: true });
      else if (sort === 'price_desc') query = query.order('price', { ascending: false });
      else if (sort === 'rating')     query = query.order('rating', { ascending: false });
      else if (sort === 'popular')    query = query.order('order_count', { ascending: false });
      else                            query = query.order('created_at', { ascending: false });

      const _page    = page    || 1;
      const _perPage = perPage || 12;
      const from     = (_page - 1) * _perPage;
      query = query.range(from, from + _perPage - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      return { data: data || [], count: count || 0, error: null };
    } catch (error) {
      console.error('[Listings.getAll]', error);
      return { data: [], count: 0, error };
    }
  },

  /* ── GET BY ID — listing detail page ── */
  getById: async (id) => {
    try {
      const { data, error } = await window._lSb
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[Listings.getById]', error);
      return { data: null, error };
    }
  },

  /* ── SEARCH SUGGESTIONS ── */
  search: async (query, limit = 12) => {
    try {
      const { data, error } = await window._lSb
        .from('listings')
        .select('id, title, price, category, images, seller_name')
        .eq('status', 'active')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  /* ── FEATURED ── */
  getFeatured: async (limit = 6) => {
    try {
      const { data, error } = await window._lSb
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  /* ── RELATED ── */
  getRelated: async (category, excludeId, limit = 4) => {
    try {
      const { data, error } = await window._lSb
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .eq('category', category)
        .neq('id', excludeId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  /* ── CATEGORY COUNTS ── */
  getCounts: async () => {
    try {
      const { data, error } = await window._lSb
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

  /* ── SAVE ── */
  save: async (listingId) => {
    try {
      const { data: { user } } = await window._lSb.auth.getUser();
      if (!user) return { error: { message: 'Please log in to save listings.' } };
      const { error } = await window._lSb.from('saved_listings')
        .insert({ user_id: user.id, listing_id: listingId });
      return { error };
    } catch (error) {
      return { error };
    }
  },

  /* ── UNSAVE ── */
  unsave: async (listingId) => {
    try {
      const { data: { user } } = await window._lSb.auth.getUser();
      if (!user) return { error: null };
      const { error } = await window._lSb.from('saved_listings')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', listingId);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  /* ── GET SAVED ── */
  getSaved: async () => {
    try {
      const { data: { user } } = await window._lSb.auth.getUser();
      if (!user) return { data: [], error: null };
      const { data, error } = await window._lSb
        .from('saved_listings')
        .select('listing_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return { data: (data || []).map(r => r.listing_id), error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  /* ── SELLER PROFILE ── */
  getSellerProfile: async (sellerId) => {
    if (!sellerId) return { data: null, error: null };
    try {
      const { data, error } = await window._lSb
        .from('users')
        .select('id, full_name, avatar_url, location, bio, verified, created_at, role')
        .eq('id', sellerId)
        .single();
      if (error) return { data: null, error };
      const { data: lList } = await window._lSb
        .from('listings')
        .select('id, rating, review_count, order_count')
        .eq('seller_id', sellerId)
        .eq('status', 'active');
      const ls = lList || [];
      return {
        data: {
          ...data,
          totalOrders:   ls.reduce((s,l) => s + (l.order_count  || 0), 0),
          avgRating:     ls.length ? (ls.reduce((s,l) => s + (l.rating || 0), 0) / ls.length).toFixed(1) : '—',
          totalReviews:  ls.reduce((s,l) => s + (l.review_count || 0), 0),
          totalListings: ls.length,
          memberSince:   new Date(data.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
        },
        error: null,
      };
    } catch(e) { return { data: null, error: e }; }
  },

  /* ── LISTING REVIEWS ── */
  getListingReviews: async (listingId) => {
    try {
      const { data, error } = await window._lSb
        .from('reviews')
        .select('id, rating, comment, created_at, reviewer_id, users(full_name, avatar_url)')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { data: data || [], error: null };
    } catch(e) { return { data: [], error: e }; }
  },

  /* ── SELLER LISTINGS ── */
  getSellerListings: async (sellerId, excludeId, limit = 4) => {
    if (!sellerId) return { data: [], error: null };
    try {
      const { data, error } = await window._lSb
        .from('listings')
        .select('id, title, images, price, rating, review_count, category')
        .eq('seller_id', sellerId)
        .eq('status', 'active')
        .neq('id', excludeId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { data: data || [], error: null };
    } catch(e) { return { data: [], error: e }; }
  },

  /* ── VIEW TRACKING ── */
  trackView: async (listingId) => {
    try {
      const { data: { user } } = await window._lSb.auth.getUser().catch(() => ({ data: { user: null } }));
      window._lSb.rpc('increment_listing_view', { listing_id_arg: listingId }).catch(() => {});
      window._lSb.from('listing_views').insert({ listing_id: listingId, viewer_id: user?.id || null }).catch(() => {});
    } catch {}
  },

  /* ── HELPERS ── */
  getCatEmoji:   (cat)    => ({ physical: '<i class="fas fa-box"></i>', digital: '<i class="fas fa-floppy-disk"></i>', freelance: '<i class="fas fa-screwdriver-wrench"></i>', experience: '<i class="fas fa-star"></i>' }[cat] || '<i class="fas fa-tag"></i>'),
  getCatName:    (cat)    => ({ physical: 'Physical Goods', digital: 'Digital Products', freelance: 'Freelance Skills', experience: 'Experiences' }[cat] || cat || 'Other'),
  getImage:      (l, i=0) => l?.images?.[i] || '',
  getBadgeLabel: (badge)  => ({ featured: 'Featured', top_rated: 'Top Rated', new: 'New', trending: 'Trending' }[badge] || ''),
  getBadgeClass: (badge)  => ({ featured: 'badge-featured', top_rated: 'badge-top', new: 'badge-new', trending: 'badge-trend' }[badge] || ''),
  getStars:      (rating) => {
    const r = parseFloat(rating) || 0;
    const full  = Math.floor(r);
    const half  = r % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  },
};
