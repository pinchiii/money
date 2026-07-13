const Utils = (() => {
  // HTML 跳脫：所有使用者輸入的字串插進 innerHTML 前都要經過這裡，防 XSS
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function formatAmount(amount, currency) {
    const c = currency || Store.getSettings().currency;
    // currency 來自可同步的設定資料，輸出常直接進 innerHTML，跳脫以防萬一
    return `${esc(c)} ${Number(amount).toLocaleString('zh-TW')}`;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function formatFullDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function getMonthLabel(year, month) {
    return `${year} 年 ${month + 1} 月`;
  }

  function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function daysUntil(targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  }

  function getCategoryInfo(categoryId, type) {
    if (categoryId === 'account_adjust') return { icon: '🏦', name: '帳戶調整' };
    if (categoryId === 'bill') return { icon: '💳', name: '信用卡扣款' };
    const cats = type === 'income' ? Store.INCOME_CATEGORIES : Store.EXPENSE_CATEGORIES;
    return cats.find(c => c.id === categoryId) || { icon: '📌', name: '其他' };
  }

  function getUserInfo(userId) {
    if (userId === 'shared_wallet') return { id: 'shared_wallet', name: '共用錢包', emoji: '💩', pin: '' };
    const settings = Store.getSettings();
    return settings.users.find(u => u.id === userId) || settings.users[0];
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function groupByDate(transactions) {
    const groups = {};
    transactions.forEach(tx => {
      const dateKey = tx.date;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }

  const CARD_COLORS = [
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #f093fb, #f5576c)',
    'linear-gradient(135deg, #4facfe, #00f2fe)',
    'linear-gradient(135deg, #43e97b, #38f9d7)',
    'linear-gradient(135deg, #fa709a, #fee140)',
    'linear-gradient(135deg, #a18cd1, #fbc2eb)',
    'linear-gradient(135deg, #fccb90, #d57eeb)',
    'linear-gradient(135deg, #2D3436, #636E72)',
  ];

  const DEFAULT_USD_TWD = 32;

  function getUsdToTwdRate() {
    const r = Number(Store.getSettings().usdToTwdRate);
    return r > 0 ? r : DEFAULT_USD_TWD;
  }

  function isTwMarket(market) {
    return market === 'tse' || market === 'otc';
  }

  function usdToTwd(usd) {
    return (usd || 0) * getUsdToTwdRate();
  }

  function stockMarketValueNative(stock) {
    return (stock.currentPrice || 0) * (stock.shares || 0);
  }

  function stockCostNative(stock) {
    return (stock.avgCost || 0) * (stock.shares || 0);
  }

  function sumStocksMarketValueTw(stocks) {
    return stocks
      .filter(st => isTwMarket(st.market || 'us'))
      .reduce((s, st) => s + stockMarketValueNative(st), 0);
  }

  function sumStocksCostTw(stocks) {
    return stocks
      .filter(st => isTwMarket(st.market || 'us'))
      .reduce((s, st) => s + stockCostNative(st), 0);
  }

  function sumStocksMarketValueUsd(stocks) {
    return stocks
      .filter(st => !isTwMarket(st.market || 'us'))
      .reduce((s, st) => s + stockMarketValueNative(st), 0);
  }

  function sumStocksCostUsd(stocks) {
    return stocks
      .filter(st => !isTwMarket(st.market || 'us'))
      .reduce((s, st) => s + stockCostNative(st), 0);
  }

  function formatStockPnl(amount, market) {
    const sign = amount >= 0 ? '+' : '-';
    const abs = Math.abs(amount);
    if (isTwMarket(market)) {
      return `${sign}${formatStockPrice(abs, market)}`;
    }
    return `${sign}${formatUSD(abs)}`;
  }

  // 換算台幣（僅供參考，不併入總資產）
  function stockMarketValueTwd(stock) {
    const v = stockMarketValueNative(stock);
    return isTwMarket(stock.market || 'us') ? v : usdToTwd(v);
  }

  function stockCostTwd(stock) {
    const v = stockCostNative(stock);
    return isTwMarket(stock.market || 'us') ? v : usdToTwd(v);
  }

  function sumStocksMarketValueTwd(stocks) {
    return stocks.reduce((s, st) => s + stockMarketValueTwd(st), 0);
  }

  function sumStocksCostTwd(stocks) {
    return stocks.reduce((s, st) => s + stockCostTwd(st), 0);
  }

  function formatUSD(amount) {
    return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatStockPrice(amount, market) {
    if (market === 'tse' || market === 'otc') {
      return `NT$${Number(amount).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }
    return formatUSD(amount);
  }

  function getMarketLabel(market) {
    if (market === 'tse') return '上市';
    if (market === 'otc') return '上櫃';
    return '美股';
  }

  return {
    esc,
    formatAmount,
    formatUSD,
    formatStockPrice,
    getUsdToTwdRate,
    isTwMarket,
    usdToTwd,
    stockMarketValueNative,
    stockCostNative,
    sumStocksMarketValueTw,
    sumStocksCostTw,
    sumStocksMarketValueUsd,
    sumStocksCostUsd,
    formatStockPnl,
    stockMarketValueTwd,
    stockCostTwd,
    sumStocksMarketValueTwd,
    sumStocksCostTwd,
    getMarketLabel,
    formatDate,
    formatFullDate,
    getMonthLabel,
    todayStr,
    daysUntil,
    getCategoryInfo,
    getUserInfo,
    showToast,
    groupByDate,
    CARD_COLORS,
  };
})();
