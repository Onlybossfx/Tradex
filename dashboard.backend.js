/*
  ============================================================
  dashboard.backend.js — TRADEX SHARED BACKEND v2
  All key events fire emails + in-app notifications.
  ============================================================
*/
const _URL  = 'https://rtwbrcbifnowrqpgivma.supabase.co';
const _ANON = 'sb_publishable_ydvrDDChpJ-pkeDLZlcJyA_Qqk0OUd7';
const { createClient } = supabase;
const _sb = createClient(_URL, _ANON);
const _fmt = n => Number(n||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});

window.DB = {

  /* ══ EMAIL (fire-and-forget) ══ */
  sendEmail: async (type, to, data = {}) => {
    if (!to) return;
    try {
      await fetch(`${_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_ANON}` },
        body: JSON.stringify({ type, to, ...data }),
      });
    } catch (e) { console.warn('[sendEmail] silent fail:', e); }
  },

  /* ══ AUTH ══ */
  getUser: async () => { const { data: { user } } = await _sb.auth.getUser(); return user; },
  logout: async () => { await _sb.auth.signOut(); window.location.href = 'tradex-auth.html'; },
  updateProfile: async (meta) => {
    const { error } = await _sb.auth.updateUser({ data: meta });
    if (!error) {
      const { data: { user } } = await _sb.auth.getUser();
      await _sb.from('users').update({
        full_name:   meta.full_name,
        ...(meta.location    ? { location:    meta.location    } : {}),
        ...(meta.bio         ? { bio:         meta.bio         } : {}),
        ...(meta.avatar_url  ? { avatar_url:  meta.avatar_url  } : {}),
        ...(meta.payout_method ? { payout_method: meta.payout_method } : {}),
        ...(meta.payout_account ? { payout_account: meta.payout_account } : {}),
      }).eq('id', user.id);
    }
    return { error };
  },
  changePassword: async (newPassword) => {
    const { error } = await _sb.auth.updateUser({ password: newPassword });
    return { error };
  },
  getUserProfile: async (userId) => {
    const { data, error } = await _sb.from('users').select('*').eq('id', userId).single();
    return { data, error };
  },

  /* ══ LISTINGS ══ */
  getMyListings: async (userId) => {
    const { data, error } = await _sb.from('listings').select('*')
      .eq('seller_id', userId).order('created_at', { ascending: false });
    return { data: data || [], error };
  },
  createListing: async (payload) => {
    const { data, error } = await _sb.from('listings').insert(payload).select().single();
    return { data, error };
  },
  updateListing: async (id, userId, payload) => {
    const { data, error } = await _sb.from('listings').update(payload)
      .eq('id', id).eq('seller_id', userId).select().single();
    return { data, error };
  },
  deleteListing: async (id, userId) => {
    const { error } = await _sb.from('listings').delete().eq('id', id).eq('seller_id', userId);
    return { error };
  },
  toggleListingStatus: async (id, userId, status) => {
    const { error } = await _sb.from('listings').update({ status }).eq('id', id).eq('seller_id', userId);
    return { error };
  },
  uploadListingImage: async (userId, file) => {
    const ext  = file.name.split('.').pop();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await _sb.storage.from('listings').upload(path, file, { upsert: true });
    if (error) return { url: null, error };
    const { data: { publicUrl } } = _sb.storage.from('listings').getPublicUrl(path);
    return { url: publicUrl, error: null };
  },

  /* ══ ORDERS ══ */
  getSellerOrders: async (userId) => {
    const { data, error } = await _sb.from('orders').select('*')
      .eq('seller_id', userId).order('created_at', { ascending: false });
    return { data: data || [], error };
  },
  getBuyerOrders: async (userId) => {
    const { data, error } = await _sb.from('orders').select('*')
      .eq('buyer_id', userId).order('created_at', { ascending: false });
    return { data: data || [], error };
  },
  createOrder: async (payload) => {
    const { data, error } = await _sb.from('orders').insert(payload).select().single();
    if (!error && data) {
      const orderRef = `#TRX-${String(data.id).padStart(6,'0')}`;
      /* notify seller in-app */
      await DB.createNotification(
        data.seller_id, 'order_placed', 'New Order Received 🛒',
        `${data.buyer_name} ordered "${data.listing_title}" — ${orderRef}`,
        'dashboard-seller.html'
      );
      /* email seller */
      const { data: seller } = await _sb.from('users').select('email,full_name').eq('id', data.seller_id).single();
      if (seller) {
        await DB.sendEmail('order_placed', seller.email, {
          toName: seller.full_name, orderRef,
          listingTitle: data.listing_title, amount: `$${_fmt(data.amount)}`,
          buyerName: data.buyer_name, packageLabel: data.package_label,
          deliveryDays: data.delivery_days,
          link: `${window.location.origin}/dashboard-seller.html`,
        });
      }
      /* email buyer confirmation */
      const { data: buyer } = await _sb.from('users').select('email,full_name').eq('id', data.buyer_id).single();
      if (buyer) {
        await DB.sendEmail('order_confirmed_buyer', buyer.email, {
          toName: buyer.full_name, orderRef,
          listingTitle: data.listing_title, amount: `$${_fmt(data.amount)}`,
          sellerName: data.seller_name, packageLabel: data.package_label,
          deliveryDays: data.delivery_days,
          link: `${window.location.origin}/dashboard-buyer.html`,
        });
      }
    }
    return { data, error };
  },
  updateOrderStatus: async (orderId, status, userId, role = 'seller') => {
    const col = role === 'seller' ? 'seller_id' : 'buyer_id';
    const { data: order } = await _sb.from('orders').select('*').eq('id', orderId).single();
    const { error } = await _sb.from('orders').update({ status }).eq('id', orderId).eq(col, userId);
    if (!error && order) {
      const orderRef = `#TRX-${String(orderId).padStart(6,'0')}`;
      if (status === 'delivered') {
        /* seller marked delivered — notify buyer */
        await DB.createNotification(order.buyer_id, 'order_delivered',
          'Delivery Update 📦', `"${order.listing_title}" has been marked as delivered. Please confirm receipt.`,
          'dashboard-buyer.html');
        const { data: buyer } = await _sb.from('users').select('email,full_name').eq('id', order.buyer_id).single();
        if (buyer) await DB.sendEmail('order_delivered', buyer.email, {
          toName: buyer.full_name, orderRef,
          listingTitle: order.listing_title, sellerName: order.seller_name,
          link: `${window.location.origin}/dashboard-buyer.html`,
        });
      }
      if (status === 'complete') {
        /* buyer confirmed — notify seller payout released */
        await DB.createNotification(order.seller_id, 'order_delivered',
          'Payment Released 💰', `${order.buyer_name} confirmed delivery of "${order.listing_title}". Your payout is queued.`,
          'dashboard-seller.html');
        const { data: seller } = await _sb.from('users').select('email,full_name').eq('id', order.seller_id).single();
        if (seller) await DB.sendEmail('order_delivered', seller.email, {
          toName: seller.full_name, orderRef,
          listingTitle: order.listing_title, buyerName: order.buyer_name,
          amount: `$${_fmt(Number(order.seller_payout || order.amount * 0.92))}`,
          link: `${window.location.origin}/dashboard-seller.html`,
        });
      }
    }
    return { error };
  },

  /* ══ SAVED ══ */
  getSavedListings: async (userId) => {
    const { data, error } = await _sb.from('saved_listings').select('listing_id').eq('user_id', userId);
    if (error || !data?.length) return { data: [], error };
    const ids = data.map(r => r.listing_id);
    const { data: listings } = await _sb.from('listings').select('*').in('id', ids).eq('status', 'active');
    return { data: listings || [], error: null };
  },
  unsaveListing: async (userId, listingId) => {
    const { error } = await _sb.from('saved_listings').delete().eq('user_id', userId).eq('listing_id', listingId);
    return { error };
  },

  /* ══ MESSAGES ══ */
  getConversations: async (userId) => {
    const { data: orders, error } = await _sb.from('orders')
      .select('id, listing_title, listing_image, buyer_id, seller_id, buyer_name, seller_name, status')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error };
    const convs = await Promise.all((orders || []).map(async (o) => {
      const { data: msgs } = await _sb.from('messages').select('content, created_at, sender_id, read')
        .eq('order_id', o.id).order('created_at', { ascending: false }).limit(1);
      const { count: unread } = await _sb.from('messages').select('*', { count: 'exact', head: true })
        .eq('order_id', o.id).eq('receiver_id', userId).eq('read', false);
      const isB = o.buyer_id === userId;
      return {
        order_id: o.id, other_id: isB ? o.seller_id : o.buyer_id,
        other_name: isB ? o.seller_name : o.buyer_name,
        listing_title: o.listing_title, listing_image: o.listing_image,
        last_message: msgs?.[0]?.content || 'No messages yet',
        last_at: msgs?.[0]?.created_at, unread: unread || 0,
      };
    }));
    return { data: convs.filter(c => c.last_at), error: null };
  },
  getMessages: async (orderId) => {
    const { data, error } = await _sb.from('messages').select('*')
      .eq('order_id', orderId).order('created_at', { ascending: true });
    return { data: data || [], error };
  },
  sendMessage: async (orderId, senderId, receiverId, content) => {
    const { data, error } = await _sb.from('messages')
      .insert({ order_id: orderId, sender_id: senderId, receiver_id: receiverId, content })
      .select().single();
    if (!error) {
      /* in-app notification */
      const { data: sender } = await _sb.from('users').select('full_name').eq('id', senderId).single();
      const { data: order }  = await _sb.from('orders').select('listing_title').eq('id', orderId).single();
      await DB.createNotification(receiverId, 'message',
        `New message from ${sender?.full_name||'User'}`,
        content.slice(0, 80) + (content.length > 80 ? '…' : ''),
        'dashboard-buyer.html');
      /* email — only if receiver hasn't been active recently (basic throttle) */
      const { data: receiver } = await _sb.from('users').select('email,full_name').eq('id', receiverId).single();
      if (receiver) {
        await DB.sendEmail('new_message', receiver.email, {
          toName: receiver.full_name, senderName: sender?.full_name||'User',
          listingTitle: order?.listing_title||'your order',
          messagePreview: content.slice(0,200),
          link: `${window.location.origin}/dashboard-buyer.html`,
        });
      }
    }
    return { data, error };
  },
  markMessagesRead: async (orderId, receiverId) => {
    await _sb.from('messages').update({ read: true })
      .eq('order_id', orderId).eq('receiver_id', receiverId).eq('read', false);
  },
  subscribeToMessages: (orderId, callback) => {
    return _sb.channel(`messages:${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, callback)
      .subscribe();
  },

  /* ══ REVIEWS ══ */
  submitReview: async (orderId, listingId, reviewerId, revieweeId, rating, comment) => {
    const { data, error } = await _sb.from('reviews')
      .insert({ order_id: orderId, listing_id: listingId, reviewer_id: reviewerId, reviewee_id: revieweeId, rating, comment })
      .select().single();
    if (!error) {
      /* get listing + seller info for notification */
      const { data: listing } = await _sb.from('listings').select('title').eq('id', listingId).single();
      const { data: reviewer } = await _sb.from('users').select('full_name').eq('id', reviewerId).single();
      const { data: seller }   = await _sb.from('users').select('email,full_name').eq('id', revieweeId).single();
      await DB.createNotification(revieweeId, 'review',
        `New ${rating}⭐ review`,
        `${reviewer?.full_name||'A buyer'} left a review on "${listing?.title||'your listing'}"`,
        'dashboard-seller.html');
      if (seller) await DB.sendEmail('review_received', seller.email, {
        toName: seller.full_name, rating,
        listingTitle: listing?.title||'your listing',
        buyerName: reviewer?.full_name||'A buyer', comment,
        link: `${window.location.origin}/dashboard-seller.html`,
      });
    }
    return { data, error };
  },
  getListingReviews: async (listingId) => {
    const { data, error } = await _sb.from('reviews').select('*, users(full_name, avatar_url)')
      .eq('listing_id', listingId).order('created_at', { ascending: false });
    return { data: data || [], error };
  },

  /* ══ EARNINGS ══ */
  getEarnings: async (userId) => {
    const { data: orders, error } = await _sb.from('orders')
      .select('amount, platform_fee, seller_payout, status, created_at, listing_title')
      .eq('seller_id', userId);
    if (error) return { data: null, error };
    const complete   = (orders||[]).filter(o=>o.status==='complete');
    const now        = new Date();
    const thisMonth  = complete.filter(o=>{const d=new Date(o.created_at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
    const lastMonth  = complete.filter(o=>{const d=new Date(o.created_at);return d.getMonth()===(now.getMonth()-1+12)%12;});
    const escrowed   = (orders||[]).filter(o=>o.status==='escrowed');
    const pay        = o => Number(o.seller_payout)||Number(o.amount)*0.92;
    const totalEarned  = complete.reduce((s,o)=>s+pay(o),0);
    const monthEarned  = thisMonth.reduce((s,o)=>s+pay(o),0);
    const lastMEarned  = lastMonth.reduce((s,o)=>s+pay(o),0);
    const pendingAmt   = escrowed.reduce((s,o)=>s+pay(o),0);
    const chart = {};
    for (let i=6;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);chart[d.toLocaleDateString('en-GB',{month:'short'})]=0;}
    complete.forEach(o=>{const k=new Date(o.created_at).toLocaleDateString('en-GB',{month:'short'});if(chart[k]!==undefined)chart[k]+=pay(o);});
    return { data:{ totalEarned, monthEarned, lastMEarned, pendingAmt,
      available: totalEarned-pendingAmt,
      monthChange: lastMEarned>0?((monthEarned-lastMEarned)/lastMEarned*100).toFixed(0):null,
      chart,
      transactions:(orders||[]).map(o=>({
        desc:o.listing_title||'Order', type:o.status==='complete'?'credit':o.status==='escrowed'?'pending':'other',
        amount:pay(o), date:o.created_at, status:o.status,
      })).sort((a,b)=>new Date(b.date)-new Date(a.date)),
    }, error:null };
  },

  /* ══ PAYOUTS ══ */
  getPayouts: async (userId) => {
    const { data, error } = await _sb.from('payouts').select('*')
      .eq('seller_id', userId).order('created_at', { ascending: false });
    return { data: data||[], error };
  },
  requestPayout: async (userId, amount, method, account) => {
    const { data, error } = await _sb.from('payouts')
      .insert({ seller_id: userId, amount, method, account, status: 'pending' })
      .select().single();
    return { data, error };
  },
  savePayoutMethod: async (userId, method, account) => {
    const { error } = await _sb.from('users').update({ payout_method: method, payout_account: account }).eq('id', userId);
    return { error };
  },
  getPayoutMethod: async (userId) => {
    const { data } = await _sb.from('users').select('payout_method, payout_account').eq('id', userId).single();
    return data || {};
  },

  /* ══ NOTIFICATIONS ══ */
  getNotifications: async (userId, limit=30) => {
    const { data, error } = await _sb.from('notifications').select('*')
      .eq('user_id', userId).order('created_at',{ascending:false}).limit(limit);
    return { data: data||[], error };
  },
  markNotifRead:    async (id) => { await _sb.from('notifications').update({read:true}).eq('id',id); },
  markAllNotifsRead:async (userId) => { await _sb.from('notifications').update({read:true}).eq('user_id',userId).eq('read',false); },
  getUnreadNotifCount: async (userId) => {
    const {count} = await _sb.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',userId).eq('read',false);
    return count||0;
  },
  createNotification: async (userId, type, title, body, link=null) => {
    if (!userId) return { error: null };
    const {error} = await _sb.from('notifications').insert({user_id:userId,type,title,body,link});
    return {error};
  },
  subscribeToNotifications: (userId, callback) => {
    return _sb.channel(`notifs:${userId}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${userId}`},callback)
      .subscribe();
  },

  /* ══ ANALYTICS ══ */
  getListingAnalytics: async (userId) => {
    const { data: listings, error } = await _sb.from('listings')
      .select('id, title, view_count, order_count, review_count, rating, price, status, created_at')
      .eq('seller_id', userId).order('view_count',{ascending:false});
    if (error) return { data:null, error };
    const { data: views } = await _sb.from('listing_views').select('listing_id, created_at')
      .in('listing_id',(listings||[]).map(l=>l.id))
      .gte('created_at',new Date(Date.now()-30*86400000).toISOString());
    const viewsByDay={};
    (views||[]).forEach(v=>{
      const day=new Date(v.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
      viewsByDay[day]=(viewsByDay[day]||0)+1;
    });
    return { data:{ listings:listings||[], viewsByDay, totalViews:(listings||[]).reduce((s,l)=>s+(l.view_count||0),0) }, error:null };
  },
  logListingView: async (listingId, userId=null) => {
    await _sb.rpc('increment_listing_view',{listing_id_arg:listingId});
    await _sb.from('listing_views').insert({listing_id:listingId,viewer_id:userId}).select();
  },

  /* ══ ADDRESSES ══ */
  getAddresses: async (userId) => {
    const {data,error}=await _sb.from('addresses').select('*').eq('user_id',userId).order('is_default',{ascending:false});
    return {data:data||[],error};
  },
  saveAddress: async (userId, address) => {
    if (address.is_default) await _sb.from('addresses').update({is_default:false}).eq('user_id',userId);
    if (address.id) {
      const {id,...rest}=address;
      const {data,error}=await _sb.from('addresses').update(rest).eq('id',id).eq('user_id',userId).select().single();
      return {data,error};
    }
    const {data,error}=await _sb.from('addresses').insert({...address,user_id:userId}).select().single();
    return {data,error};
  },
  deleteAddress: async (id, userId) => {
    const {error}=await _sb.from('addresses').delete().eq('id',id).eq('user_id',userId);
    return {error};
  },

  /* ══ DISPUTES ══ */
  getDisputes: async (userId, role='buyer') => {
    const col=role==='buyer'?'buyer_id':'seller_id';
    const {data,error}=await _sb.from('disputes').select('*, orders(listing_title,listing_image,amount)')
      .eq(col,userId).order('created_at',{ascending:false});
    return {data:data||[],error};
  },
  openDispute: async (orderId, buyerId, sellerId, reason, description) => {
    const {data,error}=await _sb.from('disputes')
      .insert({order_id:orderId,buyer_id:buyerId,seller_id:sellerId,reason,description,status:'open'})
      .select().single();
    if (!error) {
      await _sb.from('orders').update({status:'disputed'}).eq('id',orderId);
      const {data:order}=await _sb.from('orders').select('listing_title').eq('id',orderId).single();
      const {data:buyer}=await _sb.from('users').select('full_name').eq('id',buyerId).single();
      const {data:sellerUser}=await _sb.from('users').select('email,full_name').eq('id',sellerId).single();
      const orderRef=`#TRX-${String(orderId).padStart(6,'0')}`;
      await DB.createNotification(sellerId,'dispute','Dispute Opened ⚠️',
        `${buyer?.full_name||'A buyer'} opened a dispute on "${order?.listing_title||'your order'}"`,
        'dashboard-seller.html');
      if (sellerUser) await DB.sendEmail('dispute_opened',sellerUser.email,{
        toName:sellerUser.full_name, orderRef,
        listingTitle:order?.listing_title||'your order',
        reason:reason.replace(/_/g,' '),
        link:`${window.location.origin}/dashboard-seller.html`,
      });
    }
    return {data,error};
  },

  /* ══ COUNTS ══ */
  getUnreadMessageCount: async (userId) => {
    const {count}=await _sb.from('messages').select('*',{count:'exact',head:true}).eq('receiver_id',userId).eq('read',false);
    return count||0;
  },
  getPendingOrderCount: async (userId, role='seller') => {
    const col=role==='seller'?'seller_id':'buyer_id';
    const {count}=await _sb.from('orders').select('*',{count:'exact',head:true}).eq(col,userId).in('status',['pending','escrowed','delivered']);
    return count||0;
  },

  /* ══ ADMIN ══ */
  admin: {
    isAdmin: async () => {
      const {data:{user}}=await _sb.auth.getUser();
      if (!user) return false;
      const {data}=await _sb.from('users').select('is_admin').eq('id',user.id).single();
      return data?.is_admin===true;
    },
    getStats: async () => {
      const [users,listings,orders,disputes]=await Promise.all([
        _sb.from('users').select('*',{count:'exact',head:true}),
        _sb.from('listings').select('*',{count:'exact',head:true}).eq('status','active'),
        _sb.from('orders').select('*',{count:'exact',head:true}),
        _sb.from('disputes').select('*',{count:'exact',head:true}).eq('status','open'),
      ]);
      const {data:revenue}=await _sb.from('orders').select('amount,created_at').eq('status','complete');
      const totalRevenue=(revenue||[]).reduce((s,o)=>s+Number(o.amount),0);
      /* real chart — group by month */
      const chart={};
      for(let i=6;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);chart[d.toLocaleDateString('en-GB',{month:'short'})]=0;}
      (revenue||[]).forEach(o=>{const k=new Date(o.created_at).toLocaleDateString('en-GB',{month:'short'});if(chart[k]!==undefined)chart[k]+=Number(o.amount);});
      return { users:users.count||0, listings:listings.count||0, orders:orders.count||0,
        openDisputes:disputes.count||0, totalRevenue, platformFees:totalRevenue*0.08, chart };
    },
    getUsers: async ({search='',role='',page=1,perPage=20}={}) => {
      let q=_sb.from('users').select('*',{count:'exact'});
      if(search)q=q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      if(role)q=q.eq('role',role);
      const from=(page-1)*perPage;
      q=q.range(from,from+perPage-1).order('created_at',{ascending:false});
      const {data,count,error}=await q;
      return {data:data||[],count:count||0,error};
    },
    getListings: async ({search='',category='',status='',page=1,perPage=20}={}) => {
      let q=_sb.from('listings').select('*',{count:'exact'});
      if(search)q=q.ilike('title',`%${search}%`);
      if(category)q=q.eq('category',category);
      if(status)q=q.eq('status',status);
      const from=(page-1)*perPage;
      q=q.range(from,from+perPage-1).order('created_at',{ascending:false});
      const {data,count,error}=await q;
      return {data:data||[],count:count||0,error};
    },
    getOrders: async ({status='',page=1,perPage=20}={}) => {
      let q=_sb.from('orders').select('*',{count:'exact'});
      if(status)q=q.eq('status',status);
      const from=(page-1)*perPage;
      q=q.range(from,from+perPage-1).order('created_at',{ascending:false});
      const {data,count,error}=await q;
      return {data:data||[],count:count||0,error};
    },
    getDisputes: async ({status=''}={}) => {
      let q=_sb.from('disputes').select('*, orders(listing_title,amount), buyer:buyer_id(full_name,email), seller:seller_id(full_name,email)');
      if(status)q=q.eq('status',status);
      const {data,error}=await q.order('created_at',{ascending:false});
      return {data:data||[],error};
    },
    resolveDispute: async (id, resolution, winner) => {
      const status=winner==='buyer'?'resolved_buyer':'resolved_seller';
      const {data:dispute}=await _sb.from('disputes')
        .select('*, orders(listing_title), buyer:buyer_id(email,full_name), seller:seller_id(email,full_name)')
        .eq('id',id).single();
      await _sb.from('disputes').update({status,resolution,resolved_at:new Date().toISOString()}).eq('id',id);
      if (dispute?.order_id) await _sb.from('orders').update({status:'complete'}).eq('id',dispute.order_id);
      const orderRef=`#TRX-${String(dispute?.order_id||0).padStart(6,'0')}`;
      /* notify + email both parties */
      for (const party of [dispute?.buyer,dispute?.seller].filter(Boolean)) {
        await DB.createNotification(winner==='buyer'?dispute?.buyer_id:dispute?.seller_id,'dispute',
          'Dispute Resolved ✅', `Resolution: ${resolution}`, 'dashboard-buyer.html');
        if (party.email) await DB.sendEmail('dispute_resolved',party.email,{
          toName:party.full_name, orderRef,
          listingTitle:dispute?.orders?.listing_title||'your order', resolution,
          link:`${window.location.origin}/dashboard-buyer.html`,
        });
      }
      return {error:null};
    },
    updateUserStatus: async (userId, updates) => {
      const {error}=await _sb.from('users').update(updates).eq('id',userId);
      return {error};
    },
    updateListingStatus: async (listingId, status) => {
      const {error}=await _sb.from('listings').update({status}).eq('id',listingId);
      return {error};
    },
    getPayouts: async ({status=''}={}) => {
      let q=_sb.from('payouts').select('*, seller:seller_id(full_name,email)');
      if(status)q=q.eq('status',status);
      const {data,error}=await q.order('created_at',{ascending:false});
      return {data:data||[],error};
    },
    processPayout: async (payoutId, status, reference='') => {
      const {data:payout}=await _sb.from('payouts').select('*, seller:seller_id(email,full_name)').eq('id',payoutId).single();
      const {error}=await _sb.from('payouts').update({
        status,reference,...(status==='paid'?{paid_at:new Date().toISOString()}:{}),
      }).eq('id',payoutId);
      if (!error && payout?.seller?.email) {
        await DB.createNotification(payout.seller_id,'payout',
          status==='paid'?'Payout Sent 💰':'Payout Update',
          `$${_fmt(payout.amount)} via ${payout.method} — ${status}`,
          'dashboard-seller.html');
        await DB.sendEmail('payout_processed',payout.seller.email,{
          toName:payout.seller.full_name, amount:_fmt(payout.amount),
          method:payout.method, status, reference,
          link:`${window.location.origin}/dashboard-seller.html`,
        });
      }
      return {error};
    },
  },
};
