const Utils = (() => {
  function formatAmount(amount, currency) {
    const c = currency || Store.getSettings().currency;
    return `${c} ${Number(amount).toLocaleString('zh-TW')}`;
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
    const cats = type === 'income' ? Store.INCOME_CATEGORIES : Store.EXPENSE_CATEGORIES;
    return cats.find(c => c.id === categoryId) || { icon: '📌', name: '其他' };
  }

  function getUserInfo(userId) {
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

  return {
    formatAmount,
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
