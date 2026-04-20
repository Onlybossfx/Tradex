/*
  ============================================================
  TraydR Currency System
  - All prices stored in USD in the database
  - Detected from browser locale / user's country on checkout
  - Live rates fetched from exchangerate-api (free tier)
  - Falls back to hardcoded rates if API unavailable
  ============================================================
*/

const Currency = (() => {

  /* ── Fallback rates (USD base) — update periodically ── */
  const FALLBACK_RATES = {
    USD: 1,
    NGN: 1620,   /* Nigerian Naira   */
    GHS: 15.8,   /* Ghanaian Cedi    */
    KES: 129,    /* Kenyan Shilling  */
    ZAR: 18.7,   /* South African Rand */
    GBP: 0.79,   /* British Pound    */
    EUR: 0.93,   /* Euro             */
    INR: 83.5,   /* Indian Rupee     */
    CNY: 7.24,   /* Chinese Yuan     */
    CAD: 1.36,   /* Canadian Dollar  */
    AUD: 1.53,   /* Australian Dollar */
  };

  /* ── Currency metadata ── */
  const META = {
    USD: { symbol: '$',  name: 'US Dollar',        flag: '🇺🇸', locale: 'en-US' },
    NGN: { symbol: '₦',  name: 'Nigerian Naira',   flag: '🇳🇬', locale: 'en-NG' },
    GHS: { symbol: 'GH₵', name: 'Ghanaian Cedi',  flag: '🇬🇭', locale: 'en-GH' },
    KES: { symbol: 'KSh', name: 'Kenyan Shilling', flag: '🇰🇪', locale: 'en-KE' },
    ZAR: { symbol: 'R',  name: 'South African Rand', flag: '🇿🇦', locale: 'en-ZA' },
    GBP: { symbol: '£',  name: 'British Pound',    flag: '🇬🇧', locale: 'en-GB' },
    EUR: { symbol: '€',  name: 'Euro',             flag: '🇪🇺', locale: 'de-DE' },
    INR: { symbol: '₹',  name: 'Indian Rupee',     flag: '🇮🇳', locale: 'en-IN' },
    CNY: { symbol: '¥',  name: 'Chinese Yuan',     flag: '🇨🇳', locale: 'zh-CN' },
    CAD: { symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦', locale: 'en-CA' },
    AUD: { symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', locale: 'en-AU' },
  };

  /* ── Country → currency map ── */
  const COUNTRY_CURRENCY = {
    NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR',
    GB: 'GBP', US: 'USD', IN: 'INR', CN: 'CNY',
    CA: 'CAD', AU: 'AUD',
    DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
    /* Default everything else to USD */
  };

  let _rates    = { ...FALLBACK_RATES };
  let _currency = 'USD';
  let _country  = 'US';
  let _loaded   = false;

  /* ── Detect country from IP (free, no key needed) ── */
  async function detectCountry() {
    try {
      const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      return { country: d.country_code || 'US', currency: d.currency || 'USD' };
    } catch {
      /* Fallback: guess from browser language */
      const lang = navigator.language || 'en-US';
      const tag  = lang.split('-')[1] || 'US';
      const cur  = COUNTRY_CURRENCY[tag] || 'USD';
      return { country: tag, currency: cur };
    }
  }

  /* ── Fetch live rates ── */
  async function fetchRates(base = 'USD') {
    try {
      const r = await fetch(
        `https://api.exchangerate-api.com/v4/latest/${base}`,
        { signal: AbortSignal.timeout(4000) }
      );
      const d = await r.json();
      if (d.rates) return d.rates;
    } catch {}
    return null;
  }

  /* ── Init — call once on page load ── */
  async function init() {
    if (_loaded) return { currency: _currency, country: _country };

    /* Check localStorage cache (1 hour) */
    const cached = localStorage.getItem('traydr_currency_data');
    if (cached) {
      try {
        const { currency, country, rates, ts } = JSON.parse(cached);
        if (Date.now() - ts < 3600000) { /* 1 hour */
          _currency = currency;
          _country  = country;
          _rates    = rates;
          _loaded   = true;
          return { currency, country };
        }
      } catch {}
    }

    const { country, currency } = await detectCountry();
    _country  = country;
    _currency = COUNTRY_CURRENCY[country] || currency || 'USD';

    const live = await fetchRates('USD');
    if (live) _rates = { USD: 1, ...live };

    localStorage.setItem('traydr_currency_data', JSON.stringify({
      currency: _currency, country: _country, rates: _rates, ts: Date.now()
    }));

    _loaded = true;
    return { currency: _currency, country: _country };
  }

  /* ── Convert USD → current currency ── */
  function convert(usdAmount) {
    const rate = _rates[_currency] || 1;
    return +(usdAmount * rate).toFixed(2);
  }

  /* ── Format number as currency string ── */
  function format(usdAmount, overrideCurrency) {
    const cur  = overrideCurrency || _currency;
    const rate = _rates[cur] || 1;
    const amt  = +(usdAmount * rate);
    const meta = META[cur] || META.USD;
    try {
      return new Intl.NumberFormat(meta.locale, {
        style:    'currency',
        currency: cur,
        maximumFractionDigits: cur === 'NGN' || cur === 'KES' || cur === 'INR' ? 0 : 2,
      }).format(amt);
    } catch {
      return meta.symbol + amt.toLocaleString();
    }
  }

  /* ── Get current currency code ── */
  function getCurrency()  { return _currency; }
  function getCountry()   { return _country; }
  function getMeta(cur)   { return META[cur || _currency] || META.USD; }
  function getSymbol()    { return (META[_currency] || META.USD).symbol; }
  function getRateToUSD() { return _rates[_currency] || 1; }

  /* ── Set manually (user picks) ── */
  function set(currencyCode) {
    if (META[currencyCode]) {
      _currency = currencyCode;
      localStorage.setItem('traydr_user_currency', currencyCode);
    }
  }

  return { init, convert, format, getCurrency, getCountry, getMeta, getSymbol, getRateToUSD, set, META, COUNTRY_CURRENCY };
})();

window.Currency = Currency;
