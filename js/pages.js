const Pages = (() => {
  const esc = Utils.esc; // 使用者輸入插入 innerHTML 前一律跳脫
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let walletFilter = 'shared'; // 'shared' | 'house_fund' | 'personal'
  const ASSET_VIEW_KEY = 'pinchi_asset_view';
  // 共同資產為主：預設顯示買房基金，記住使用者上次的選擇
  let assetView = localStorage.getItem(ASSET_VIEW_KEY) || 'house_fund'; // 'personal' | 'house_fund'
  let cardViewId = null;
  let txViewMode = 'list';   // 'list' | 'calendar' | 'chart'
  let calendarSelectedDate = null;
  let dashboardTab = 'shared'; // 'shared' | 'personal'，共同帳本優先

  // ──────────── Login ────────────
  function renderLogin() {
    const settings = Store.getSettings();
    return `
      <div class="login-screen">
        <div class="login-logo">🏕️</div>
        <h2 class="login-title">輕鬆記帳</h2>
        <p class="login-subtitle">一起輕鬆管理我們的帳務吧</p>
        <div class="login-users">
          ${settings.users.map(u => `
            <button class="login-user-btn" onclick="Pages.tryLogin('${esc(u.id)}')">
              <span class="login-user-emoji">${esc(u.emoji)}</span>
              <span class="login-user-name">${esc(u.name)}</span>
              ${u.pin ? '<span class="login-lock">🔒</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function tryLogin(userId) {
    const settings = Store.getSettings();
    const user = settings.users.find(u => u.id === userId);
    if (!user) return;

    if (user.pin) {
      showModal(`
        <div class="modal-header">
          <div class="modal-title">${esc(user.emoji)} 輸入 PIN</div>
          <button class="modal-close" onclick="Pages.hideModal()">✕</button>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <input type="password" id="login-pin" placeholder="輸入 PIN 碼" inputmode="numeric"
              maxlength="6" class="pin-input" autofocus>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="Pages.confirmLogin('${userId}')">進入</button>
        </div>
      `);
      setTimeout(() => document.getElementById('login-pin')?.focus(), 300);
    } else {
      Store.setCurrentUser(userId);
      hideModal();
      App.navigate('dashboard');
    }
  }

  function confirmLogin(userId) {
    const settings = Store.getSettings();
    const user = settings.users.find(u => u.id === userId);
    const pin = document.getElementById('login-pin').value;
    if (pin === user.pin) {
      Store.setCurrentUser(userId);
      hideModal();
      App.navigate('dashboard');
    } else {
      Utils.showToast('PIN 碼不正確');
    }
  }

  // ──────────── Dashboard (首頁) ────────────
  function renderDashboard() {
    const me = Store.getCurrentUser();
    const meInfo = Utils.getUserInfo(me);

    const myCards = Store.getMyCreditCards();
    const upcomingBills = myCards.map(card => {
      const info = Store.getNextPaymentInfo(card);
      const unpaid = Store.getCardUnpaidAmount(card.id);
      return { card, ...info, unpaid };
    }).filter(b => b.unpaid > 0).sort((a, b) => a.payDate - b.payDate);

    const allTxs = Store.getVisibleTransactions();
    const todayStr = Utils.todayStr();
    const monthPrefix = todayStr.slice(0, 7);
    // 只統計本月，且排除信用卡自動扣款（消費當下已記過一次，扣款屬轉帳，計入會重複）
    const isCountedExpense = (tx) => tx.type === 'expense' && !tx.isAutoBill && (tx.date || '').startsWith(monthPrefix);

    const personalTxs = allTxs.filter(tx => tx.walletType === 'personal' && tx.userId === me);
    const personalExpense = personalTxs.filter(isCountedExpense).reduce((s, tx) => s + tx.amount, 0);
    const personalToday = personalTxs.filter(tx => tx.date === todayStr)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const sharedTxs = allTxs.filter(tx => tx.walletType === 'shared');
    const sharedExpense = sharedTxs.filter(isCountedExpense).reduce((s, tx) => s + tx.amount, 0);
    const sharedRecent = sharedTxs
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);

    const myStocks = Store.getStocks();
    const dashUsStocks = myStocks.filter(s => (s.market || 'us') === 'us');
    const dashTwStocks = myStocks.filter(s => s.market === 'tse' || s.market === 'otc');
    const dashUsValue = Utils.sumStocksMarketValueUsd(dashUsStocks);
    const dashUsCost = Utils.sumStocksCostUsd(dashUsStocks);
    const dashTwValue = Utils.sumStocksMarketValueTw(dashTwStocks);
    const dashTwCost = Utils.sumStocksCostTw(dashTwStocks);

    // 共同財務摘要：買房基金總資產（台幣 = 存款 + 台股市值；美股另計）
    const hfBalances = Store.getHouseFundBalances();
    const hfStockTotals = Store.getStockTotalsByCurrency('house_fund');
    const hfTwTotal = hfBalances.cashDeposit + hfStockTotals.tw;
    const hfUsdTotal = hfStockTotals.usd;
    // 個人帳戶現金合計
    const myCashTotal = Store.getMyAccounts().reduce((s, a) => s + (a.balance || 0), 0);

    const renderTxList = (txs, emptyMsg) => {
      if (txs.length === 0) return `<div class="dash-empty">${emptyMsg}</div>`;
      return txs.map(tx => {
        const cat = Utils.getCategoryInfo(tx.category, tx.type);
        const user = Utils.getUserInfo(tx.userId);
        const sign = tx.type === 'income' ? '+' : '-';
        const typeLabel = tx.type === 'income' ? '收入' : '支出';
        return `
          <div class="tx-item" onclick="Pages.showTxDetail('${tx.id}')">
            <div class="tx-icon" style="background:${tx.type === 'income' ? '#E8F5E9' : '#FFEBEE'}">${esc(cat.icon)}</div>
            <div class="tx-details">
              <div class="tx-desc">${esc(tx.description || cat.name)}</div>
              <div class="tx-meta">
                <span class="tx-meta-text">${esc(user.emoji)} ${esc(user.name)}・${typeLabel}・${Utils.formatDate(tx.date)}</span>
              </div>
            </div>
            <div class="tx-amount ${tx.type}">${sign}${Utils.formatAmount(tx.amount)}</div>
          </div>`;
      }).join('');
    };

    return `
      <div class="user-greeting">
        <span>${esc(meInfo.emoji)} ${esc(meInfo.name)}，你好</span>
        <button class="logout-btn" onclick="App.logout()">切換帳號</button>
      </div>

      <button class="quick-add-btn" onclick="App.navigate('add')">
        <span class="quick-add-icon">+</span>
        <span>快速記帳</span>
      </button>

      <div class="card">
        <div class="card-title">💑 我們的共同財務</div>
        <div class="asset-grid">
          <div class="asset-block expense-block" onclick="Pages.setWalletFilter('shared');App.navigate('transactions')">
            <div class="asset-label">本月共同支出</div>
            <div class="asset-value">${Utils.formatAmount(sharedExpense)}</div>
          </div>
          <div class="asset-block positive" onclick="Pages.openHouseFundAssets()">
            <div class="asset-label">🏠 買房基金</div>
            <div class="asset-value">${Utils.formatAmount(hfTwTotal)}</div>
            ${hfUsdTotal > 0 ? `<div class="asset-sub">＋美股 ${Utils.formatUSD(hfUsdTotal)}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔒 我的私人</div>
        <div class="asset-grid">
          <div class="asset-block expense-block" onclick="Pages.setWalletFilter('personal');App.navigate('transactions')">
            <div class="asset-label">本月私人支出</div>
            <div class="asset-value">${Utils.formatAmount(personalExpense)}</div>
          </div>
          <div class="asset-block" onclick="Pages.setAssetView('personal');App.navigate('wallet')">
            <div class="asset-label">👤 個人帳戶現金</div>
            <div class="asset-value">${Utils.formatAmount(myCashTotal)}</div>
          </div>
        </div>
      </div>

      ${upcomingBills.length > 0 ? `
        <div class="card">
          <div class="card-title">即將扣款</div>
          ${upcomingBills.map(b => `
            <div class="bill-item" onclick="Pages.viewCardStatement('${b.card.id}')">
              <div class="bill-dot" style="background:${b.card.color || '#7A9E7E'}"></div>
              <div class="bill-info">
                <div class="bill-name">${esc(b.card.name)}</div>
                <div class="bill-date">扣款日 ${b.payDate.getMonth() + 1}/${b.payDate.getDate()}（${Utils.daysUntil(b.payDate)} 天後）</div>
              </div>
              <div class="bill-amount">-${Utils.formatAmount(b.unpaid)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${myStocks.length > 0 ? `
        <div class="card" onclick="Pages.setAssetView('personal');App.navigate('wallet')" style="cursor:pointer">
          <div class="card-title">📈 我的股票</div>
          <div class="asset-grid">
            ${dashUsStocks.length > 0 ? `
              <div class="asset-block ${dashUsValue - dashUsCost >= 0 ? 'positive' : 'negative'}">
                <div class="asset-label">🇺🇸 美股市值</div>
                <div class="asset-value">${Utils.formatUSD(dashUsValue)}</div>
              </div>
            ` : ''}
            ${dashTwStocks.length > 0 ? `
              <div class="asset-block ${dashTwValue - dashTwCost >= 0 ? 'positive' : 'negative'}">
                <div class="asset-label">🇹🇼 台股市值</div>
                <div class="asset-value">${Utils.formatStockPrice(dashTwValue, 'tse')}</div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="dash-tab-bar">
          <button class="dash-tab ${dashboardTab === 'shared' ? 'active' : ''}" onclick="Pages.setDashboardTab('shared')">💑 共同帳本</button>
          <button class="dash-tab ${dashboardTab === 'personal' ? 'active' : ''}" onclick="Pages.setDashboardTab('personal')">🔒 私人帳本</button>
        </div>
        ${dashboardTab === 'personal'
          ? renderTxList(personalToday, '要記得記帳唷！')
          : renderTxList(sharedRecent, '還沒有共同支出紀錄')
        }
      </div>
    `;
  }

  function setDashboardTab(tab) {
    dashboardTab = tab;
    App.refresh();
  }

  // ──────────── Transactions ────────────
  function getFilteredTxs() {
    const me = Store.getCurrentUser();
    const txs = Store.getVisibleTransactionsForMonth(currentYear, currentMonth);
    return txs.filter(tx => {
      if (tx.walletType === 'house_fund') return false;
      if (walletFilter === 'personal') {
        if (tx.walletType === 'personal' && tx.userId === me) return true;
        if (Store.isAdvancedByMe(tx)) return true;
        return false;
      }
      return tx.walletType === 'shared';
    });
  }

  function renderTransactions() {
    if (walletFilter === 'house_fund') walletFilter = 'shared';
    const me = Store.getCurrentUser();
    const meInfo = Utils.getUserInfo(me);
    const filtered = getFilteredTxs();
    const groups = Utils.groupByDate(filtered);

    // 信用卡自動扣款不重複計入支出（刷卡當下已記過），明細列表仍會顯示該筆
    const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = filtered.filter(t => t.type === 'expense' && !t.isAutoBill).reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;

    let content = '';
    if (walletFilter === 'shared' && txViewMode === 'list') {
      content = renderChatView(filtered);
    } else if (txViewMode === 'calendar') {
      content = renderCalendarView(filtered);
    } else if (txViewMode === 'chart') {
      content = renderChartView(filtered);
    } else {
      content = renderListView(groups);
    }

    const balanceLabel = walletFilter === 'personal' ? '我的結餘' : '共同結餘';

    return `
      <div class="month-nav">
        <button onclick="Pages.prevMonth()">‹</button>
        <span>${Utils.getMonthLabel(currentYear, currentMonth)}</span>
        <button onclick="Pages.nextMonth()">›</button>
      </div>

      <div class="balance-hero ${balance < 0 ? 'balance-negative' : 'balance-positive'}">
        <div class="balance-label">${balanceLabel}</div>
        <div class="balance-amount">${Utils.formatAmount(balance)}</div>
      </div>
      <div class="balance-row">
        <div class="balance-card income">
          <div class="balance-card-icon">＋</div>
          <div class="balance-card-info">
            <div class="balance-card-label">收入</div>
            <div class="balance-card-amount">+${Utils.formatAmount(totalIncome)}</div>
          </div>
        </div>
        <div class="balance-card expense">
          <div class="balance-card-icon">−</div>
          <div class="balance-card-info">
            <div class="balance-card-label">支出</div>
            <div class="balance-card-amount">-${Utils.formatAmount(totalExpense)}</div>
          </div>
        </div>
      </div>

      <div class="ledger-tabs">
        <button class="ledger-tab ${walletFilter === 'shared' ? 'active' : ''}" onclick="Pages.setWalletFilter('shared')">
          <span class="ledger-tab-icon">💑</span>
          <span class="ledger-tab-name">共同帳本</span>
        </button>
        <button class="ledger-tab ${walletFilter === 'personal' ? 'active' : ''}" onclick="Pages.setWalletFilter('personal')">
          <span class="ledger-tab-icon">🔒</span>
          <span class="ledger-tab-name">${esc(meInfo.name)}的私帳</span>
        </button>
      </div>

      <div class="view-mode-bar">
        <button class="view-mode-btn ${txViewMode === 'list' ? 'active' : ''}" onclick="Pages.setViewMode('list')">📋 列表</button>
        <button class="view-mode-btn ${txViewMode === 'calendar' ? 'active' : ''}" onclick="Pages.setViewMode('calendar')">📅 月曆</button>
        <button class="view-mode-btn ${txViewMode === 'chart' ? 'active' : ''}" onclick="Pages.setViewMode('chart')">📊 分析</button>
      </div>

      ${content}
    `;
  }

  // ──────────── Calendar View ────────────
  function renderCalendarView(txs) {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    const dailyTotals = {};
    txs.forEach(tx => {
      if (tx.type !== 'expense' || tx.isAutoBill) return;
      const day = Number((tx.date || '').slice(8, 10));
      if (!day) return;
      dailyTotals[day] = (dailyTotals[day] || 0) + tx.amount;
    });

    const maxDaily = Math.max(...Object.values(dailyTotals), 1);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
    const todayDate = today.getDate();

    let calHtml = '<div class="cal-grid">';
    calHtml += dayNames.map(d => `<div class="cal-header">${d}</div>`).join('');

    for (let i = 0; i < firstDayOfWeek; i++) {
      calHtml += '<div class="cal-cell empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const total = dailyTotals[day] || 0;
      const intensity = total > 0 ? Math.max(0.15, Math.min(1, total / maxDaily)) : 0;
      const isToday = isCurrentMonth && day === todayDate;
      const isSelected = calendarSelectedDate === day;
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      calHtml += `
        <div class="cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${total > 0 ? 'has-data' : ''}"
          onclick="Pages.selectCalendarDate(${day})">
          <div class="cal-day">${day}</div>
          ${total > 0 ? `<div class="cal-dot" style="opacity:${intensity}"></div>` : ''}
        </div>
      `;
    }
    calHtml += '</div>';

    if (calendarSelectedDate) {
      const selectedDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(calendarSelectedDate).padStart(2, '0')}`;
      const dayTxs = txs.filter(tx => tx.date === selectedDateStr);
      const dayExpense = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const dayIncome = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

      calHtml += `
        <div class="cal-detail">
          <div class="cal-detail-header">
            <span>${currentMonth + 1}/${calendarSelectedDate} 明細</span>
            <span style="display:flex;gap:8px;font-size:13px;font-weight:600">
              ${dayExpense > 0 ? `<span style="color:var(--expense-color)">-${Utils.formatAmount(dayExpense)}</span>` : ''}
              ${dayIncome > 0 ? `<span style="color:var(--income-color)">+${Utils.formatAmount(dayIncome)}</span>` : ''}
            </span>
          </div>
          ${dayTxs.length > 0
            ? dayTxs.map(tx => renderTxItem(tx)).join('')
            : '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">這天沒有紀錄</div>'
          }
        </div>
      `;
    }

    return calHtml;
  }

  function selectCalendarDate(day) {
    calendarSelectedDate = calendarSelectedDate === day ? null : day;
    App.refresh();
  }

  // ──────────── Chart View ────────────
  function buildDonutSvg(slices, total, centerLabel, centerValue) {
    const size = 180;
    const cx = size, cy = size, r = size - 10;
    const ir = r * 0.55;
    const labelR = (r + ir) / 2;

    let svgPaths = '';
    let svgLabels = '';
    slices.forEach(s => {
      if (s.pct < 0.001) return;
      const a1 = (s.startAngle - 90) * Math.PI / 180;
      const a2 = (s.endAngle - 90) * Math.PI / 180;
      const largeArc = s.pct > 0.5 ? 1 : 0;
      const x1o = cx + r * Math.cos(a1), y1o = cy + r * Math.sin(a1);
      const x2o = cx + r * Math.cos(a2), y2o = cy + r * Math.sin(a2);
      const x1i = cx + ir * Math.cos(a2), y1i = cy + ir * Math.sin(a2);
      const x2i = cx + ir * Math.cos(a1), y2i = cy + ir * Math.sin(a1);
      svgPaths += `<path d="M${x1o},${y1o} A${r},${r} 0 ${largeArc} 1 ${x2o},${y2o} L${x1i},${y1i} A${ir},${ir} 0 ${largeArc} 0 ${x2i},${y2i} Z" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`;

      if (s.pct >= 0.05) {
        const midAngle = ((s.startAngle + s.endAngle) / 2 - 90) * Math.PI / 180;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);
        svgLabels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="12" font-weight="700">${Math.round(s.pct * 100)}%</text>`;
      }
    });

    return `
      <svg viewBox="0 0 ${size * 2} ${size * 2}" class="pie-chart">
        ${svgPaths}
        ${svgLabels}
        <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="var(--text-secondary)" font-size="13" font-weight="600">${centerLabel}</text>
        <text x="${cx}" y="${cy + 18}" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="800">${centerValue}</text>
      </svg>
    `;
  }

  function buildSlices(items, colors) {
    let cumAngle = 0;
    return items.map((item, i) => {
      const startAngle = cumAngle;
      cumAngle += item.pct * 360;
      return { ...item, startAngle, endAngle: cumAngle, color: colors[i % colors.length] };
    });
  }

  function renderChartView(txs) {
    const expenses = txs.filter(t => t.type === 'expense' && !t.isAutoBill);
    const total = expenses.reduce((s, t) => s + t.amount, 0);

    if (total === 0) return `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">這個月還沒有支出紀錄</div>
      </div>`;

    const colors = [
      '#7A9E7E', '#C97B6B', '#8B6F47', '#D4A96A', '#A8C5AB',
      '#B8956A', '#6B8F6F', '#D4A07A', '#9BB59E', '#C4A882',
      '#FD79A8', '#636E72'
    ];

    const catTotals = {};
    expenses.forEach(tx => {
      const cat = Utils.getCategoryInfo(tx.category, 'expense');
      const key = tx.category;
      if (!catTotals[key]) catTotals[key] = { ...cat, total: 0, count: 0 };
      catTotals[key].total += tx.amount;
      catTotals[key].count++;
    });
    const sortedCats = Object.values(catTotals).sort((a, b) => b.total - a.total)
      .map(c => ({ ...c, pct: c.total / total }));
    const catSlices = buildSlices(sortedCats, colors);

    let html = `
      <div class="chart-section-title">支出分類</div>
      <div class="chart-container">
        ${buildDonutSvg(catSlices, total, '總支出', Utils.formatAmount(total))}
      </div>
      <div class="chart-legend">
        ${catSlices.map(s => `
          <div class="chart-legend-item">
            <div class="chart-legend-left">
              <div class="chart-legend-dot" style="background:${s.color}"></div>
              <span class="chart-legend-icon">${esc(s.icon)}</span>
              <span class="chart-legend-name">${esc(s.name)}</span>
            </div>
            <div class="chart-legend-right">
              <span class="chart-legend-amount">${Utils.formatAmount(s.total)}</span>
              <span class="chart-legend-pct">${Math.round(s.pct * 100)}%</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    if (walletFilter === 'shared') {
      const payerColors = ['#7A9E7E', '#C97B6B', '#8B6F47', '#D4A96A'];
      const payerTotals = {};
      expenses.forEach(tx => {
        const user = Utils.getUserInfo(tx.userId);
        if (!payerTotals[tx.userId]) payerTotals[tx.userId] = { icon: user.emoji, name: user.name, total: 0 };
        payerTotals[tx.userId].total += tx.amount;
      });
      const sortedPayers = Object.values(payerTotals).sort((a, b) => b.total - a.total)
        .map(p => ({ ...p, pct: p.total / total }));
      const payerSlices = buildSlices(sortedPayers, payerColors);

      html += `
        <div class="chart-section-title" style="margin-top:20px">誰支出</div>
        <div class="chart-container">
          ${buildDonutSvg(payerSlices, total, '總支出', Utils.formatAmount(total))}
        </div>
        <div class="chart-legend">
          ${payerSlices.map(s => `
            <div class="chart-legend-item">
              <div class="chart-legend-left">
                <div class="chart-legend-dot" style="background:${s.color}"></div>
                <span class="chart-legend-icon">${s.icon}</span>
                <span class="chart-legend-name">${s.name}</span>
              </div>
              <div class="chart-legend-right">
                <span class="chart-legend-amount">${Utils.formatAmount(s.total)}</span>
                <span class="chart-legend-pct">${Math.round(s.pct * 100)}%</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    return html;
  }

  function setViewMode(mode) {
    txViewMode = mode;
    calendarSelectedDate = null;
    App.refresh();
  }

  function renderListView(groups) {
    if (groups.length === 0) return `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">沒有符合條件的紀錄</div>
      </div>`;
    return groups.map(([date, txList]) => {
      const dayExp = txList.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const dayInc = txList.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      return `
        <div class="tx-date-group">
          <div class="tx-date-header">
            <span class="tx-date-text">${Utils.formatFullDate(date)}</span>
            <span class="tx-date-summary">
              ${dayExp > 0 ? `<span class="tx-day-expense">-${Utils.formatAmount(dayExp)}</span>` : ''}
              ${dayInc > 0 ? `<span class="tx-day-income">+${Utils.formatAmount(dayInc)}</span>` : ''}
            </span>
          </div>
          ${txList.map(tx => renderTxItem(tx)).join('')}
        </div>
      `;
    }).join('');
  }

  function renderChatView(txs) {
    const me = Store.getCurrentUser();
    if (txs.length === 0) return `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-text">還沒有共同支出紀錄<br>一起開始記帳吧！</div>
      </div>`;

    const sorted = [...txs].sort((a, b) => {
      const da = new Date(a.date + 'T' + (a.createdAt ? new Date(a.createdAt).toTimeString().slice(0, 5) : '12:00'));
      const db = new Date(b.date + 'T' + (b.createdAt ? new Date(b.createdAt).toTimeString().slice(0, 5) : '12:00'));
      return db - da;
    });

    let html = '<div class="chat-container">';
    let lastDate = '';

    sorted.forEach(tx => {
      if (tx.date !== lastDate) {
        html += `<div class="chat-date-divider"><span>${Utils.formatFullDate(tx.date)}</span></div>`;
        lastDate = tx.date;
      }

      const isMine = tx.userId === me;
      const user = Utils.getUserInfo(tx.userId);
      const cat = Utils.getCategoryInfo(tx.category, tx.type);
      const card = tx.creditCardId ? Store.getCreditCards().find(c => c.id === tx.creditCardId) : null;
      const time = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '';
      const sign = tx.type === 'income' ? '+' : '-';

      html += `
        <div class="chat-row ${isMine ? 'mine' : 'theirs'}" onclick="Pages.showTxDetail('${tx.id}')">
          ${!isMine ? `<div class="chat-avatar">${esc(user.emoji)}</div>` : ''}
          <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
            <div class="chat-bubble-cat">${esc(cat.icon)} ${esc(tx.description || cat.name)}</div>
            <div class="chat-bubble-amount ${tx.type}">${sign}${Utils.formatAmount(tx.amount)}</div>
            ${card ? `<div class="chat-bubble-card">💳 ${esc(card.name)}</div>` : ''}
            <div class="chat-bubble-time">${time}</div>
          </div>
          ${isMine ? `<div class="chat-avatar">${esc(user.emoji)}</div>` : ''}
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  function renderTxItem(tx) {
    const cat = Utils.getCategoryInfo(tx.category, tx.type);
    const payer = Utils.getUserInfo(tx.userId);
    const card = tx.creditCardId ? Store.getCreditCards().find(c => c.id === tx.creditCardId) : null;
    const sign = tx.type === 'income' ? '+' : '-';
    const isAdvanced = Store.isAdvancedByMe(tx);
    const payMethod = card ? card.name : '現金';

    return `
      <div class="tx-item" onclick="Pages.showTxDetail('${tx.id}')">
        <div class="tx-icon" style="background:${tx.type === 'income' ? '#E8F5E9' : '#FFEBEE'}">${esc(cat.icon)}</div>
        <div class="tx-details">
          <div class="tx-desc">${esc(tx.description || cat.name)}</div>
          <div class="tx-meta">
            ${isAdvanced ? '<span class="tx-wallet-tag advanced">代墊</span>' : ''}
            <span class="tx-meta-text">${esc(payer.emoji)} ${esc(payer.name)}・${esc(payMethod)}</span>
          </div>
        </div>
        <div class="tx-amount ${tx.type}">${sign}${Utils.formatAmount(tx.amount)}</div>
      </div>
    `;
  }

  // ──────────── Add Transaction ────────────
  function renderAddTransaction(editTx) {
    const me = Store.getCurrentUser();
    const meInfo = Utils.getUserInfo(me);
    const settings = Store.getSettings();
    const allCards = Store.getCreditCards();
    const myAccounts = Store.getMyAccounts();
    const isEdit = !!editTx;
    const type = editTx?.type || addTxType;
    const categories = type === 'income' ? Store.INCOME_CATEGORIES : Store.EXPENSE_CATEGORIES;
    const defaultWallet = editTx
      ? (editTx.walletType === 'house_fund' ? 'shared' : editTx.walletType)
      : walletFilter === 'shared' ? 'shared' : 'personal';
    const isPersonal = defaultWallet === 'personal';
    const showAccountField = type === 'income' && isPersonal;
    const defaultPayer = editTx?.userId || me;
    const payerCards = allCards.filter(c => c.ownerId === (isPersonal ? me : defaultPayer));

    return `
      <div class="type-toggle">
        <button class="${type === 'expense' ? 'active-expense' : ''}" onclick="Pages.switchTxType('expense')">支出</button>
        <button class="${type === 'income' ? 'active-income' : ''}" onclick="Pages.switchTxType('income')">收入</button>
      </div>

      <div class="amount-input-wrap">
        <span class="currency">${esc(settings.currency)}</span>
        <input type="number" class="amount-input" id="tx-amount" placeholder="0"
          value="${editTx?.amount || ''}" inputmode="decimal" autofocus>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label>記到哪本帳？</label>
          <div class="wallet-toggle">
            <button type="button" class="wallet-toggle-btn ${defaultWallet === 'shared' ? 'active-shared' : ''}"
              onclick="Pages.setAddWallet('shared')">
              <span class="wt-icon">💑</span>
              <span class="wt-label">共同帳本</span>
            </button>
            <button type="button" class="wallet-toggle-btn ${isPersonal ? 'active-personal' : ''}"
              onclick="Pages.setAddWallet('personal')">
              <span class="wt-icon">🔒</span>
              <span class="wt-label">私人帳本</span>
            </button>
          </div>
          <input type="hidden" id="tx-wallet" value="${defaultWallet}">
        </div>

        <div class="form-field" id="payer-field" style="${isPersonal ? 'display:none' : ''}">
          <label>${type === 'income' ? '誰放入共同錢包' : '由誰支出'}</label>
          <select id="tx-user" onchange="Pages.onPayerChange()">
            ${type === 'expense' ? '<option value="shared_wallet">💩 共用錢包</option>' : ''}
            ${settings.users.map(u => `
              <option value="${esc(u.id)}" ${defaultPayer === u.id ? 'selected' : ''}>${esc(u.emoji)} ${esc(u.name)}</option>
            `).join('')}
          </select>
        </div>

        ${type === 'expense' ? `
          <div class="form-field" id="card-field">
            <label>付款方式</label>
            <select id="tx-card">
              <option value="">💵 現金</option>
              ${payerCards.map(c => `
                <option value="${c.id}" ${editTx?.creditCardId === c.id ? 'selected' : ''}>💳 ${esc(c.name)}</option>
              `).join('')}
            </select>
            ${!isPersonal ? '<div class="field-hint">刷誰的卡，帳單就會記在誰的卡帳上</div>' : ''}
          </div>
        ` : ''}

        ${showAccountField ? `
          <div class="form-field" id="account-field">
            <label>收入入帳</label>
            <select id="tx-account">
              <option value="">💵 現金</option>
              ${myAccounts.map(a => `
                <option value="${a.id}" ${editTx?.accountId === a.id ? 'selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>
              `).join('')}
            </select>
            <div class="field-hint">選擇帳戶後，該帳戶餘額會自動增加</div>
          </div>
        ` : ''}

        <div class="form-field">
          <label>分類</label>
          <div class="category-grid" id="category-grid">
            ${categories.map(c => `
              <button class="category-btn ${editTx?.category === c.id ? 'active' : ''}" data-cat="${esc(c.id)}" onclick="Pages.selectCategory(this)">
                <span class="cat-icon">${esc(c.icon)}</span>
                ${esc(c.name)}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form-field">
          <label>說明</label>
          <input type="text" id="tx-desc" placeholder="花費的項目（選填）" value="${esc(editTx?.description || '')}">
        </div>

        <div class="form-field">
          <label>備註</label>
          <input type="text" id="tx-note" placeholder="備註紀錄" value="${esc(editTx?.note || '')}">
        </div>

        <div class="form-field">
          <label>日期</label>
          <input type="date" id="tx-date" value="${editTx?.date || Utils.todayStr()}">
        </div>
      </div>

      <button class="submit-btn ${type}" onclick="Pages.saveTx('${editTx?.id || ''}', '${type}')">
        ${isEdit ? '更新紀錄' : (type === 'expense' ? '記錄支出' : '記錄收入')}
      </button>
    `;
  }

  let addTxType = 'expense';
  let editingTx = null;

  function setAddWallet(wallet) {
    document.getElementById('tx-wallet').value = wallet;
    const payerField = document.getElementById('payer-field');
    const cardField = document.getElementById('card-field');
    const accountField = document.getElementById('account-field');
    const btns = document.querySelectorAll('.wallet-toggle-btn');
    btns.forEach(b => b.classList.remove('active-shared', 'active-personal'));

    if (wallet === 'personal') {
      btns[1].classList.add('active-personal');
      payerField.style.display = 'none';
      if (cardField) cardField.style.display = '';
      if (accountField) accountField.style.display = '';
      updateCardOptions(Store.getCurrentUser());
    } else {
      btns[0].classList.add('active-shared');
      payerField.style.display = '';
      if (accountField) accountField.style.display = 'none';
      const selectedUser = document.getElementById('tx-user').value;
      updateCardOptions(selectedUser);
    }
  }

  function onPayerChange() {
    const selectedUser = document.getElementById('tx-user').value;
    const cardField = document.getElementById('card-field');
    if (selectedUser === 'shared_wallet') {
      if (cardField) cardField.style.display = 'none';
    } else {
      if (cardField) cardField.style.display = '';
      updateCardOptions(selectedUser);
    }
  }

  function updateCardOptions(userId) {
    const cardSelect = document.getElementById('tx-card');
    if (!cardSelect) return;
    const allCards = Store.getCreditCards();
    const userCards = allCards.filter(c => c.ownerId === userId);
    const currentVal = cardSelect.value;
    cardSelect.innerHTML = '<option value="">💵 現金</option>' +
      userCards.map(c => `<option value="${c.id}" ${currentVal === c.id ? 'selected' : ''}>💳 ${Utils.esc(c.name)}</option>`).join('');
  }

  // ──────────── Credit Cards (獨立頁面) ────────────
  function renderCreditCards() {
    const myCards = Store.getMyCreditCards();
    const totalUnpaid = myCards.reduce((s, c) => s + Store.getCardUnpaidAmount(c.id), 0);

    return `
      ${myCards.length > 0 ? `
        <div class="card" style="text-align:center;padding:20px">
          <div class="card-title">待繳總額</div>
          <div style="font-size:28px;font-weight:800;color:var(--expense-color)">${Utils.formatAmount(totalUnpaid)}</div>
        </div>
      ` : ''}

      ${myCards.length > 0 ? myCards.map(card => {
        const unpaid = Store.getCardUnpaidAmount(card.id);
        const info = Store.getNextPaymentInfo(card);
        return `
          <div class="credit-card-visual" style="background:${card.color}" onclick="Pages.viewCardStatement('${card.id}')">
            <div>
              <div class="cc-name">${esc(card.name)}</div>
              <div class="cc-number">•••• •••• •••• ${esc(card.lastFourDigits || '****')}</div>
            </div>
            <div class="cc-bottom">
              <div>
                <div class="cc-label">結帳日 / 扣款日</div>
                <div class="cc-value">${card.statementDay}號 / ${card.paymentDay}號</div>
              </div>
              <div class="cc-unpaid">
                <div class="cc-label">待繳金額</div>
                <div class="cc-unpaid-amount">${Utils.formatAmount(unpaid)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('') : `
        <div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:14px">
          還沒有信用卡，點下方按鈕新增
        </div>
      `}

      <button class="add-card-btn" onclick="Pages.showAddCard()">+ 新增信用卡</button>
    `;
  }

  function renderCards() {
    if (cardViewId) {
      return renderCardStatement(cardViewId);
    }
    return renderCreditCards();
  }

  function renderCardStatement(cardId) {
    const card = Store.getCreditCards().find(c => c.id === cardId);
    if (!card) { cardViewId = null; return renderCards(); }

    const txs = Store.getCardTransactionsForMonth(cardId, currentYear, currentMonth);
    const totalOnCard = txs.reduce((s, t) => s + t.amount, 0);
    const sharedOnCard = txs.filter(t => t.walletType === 'shared').reduce((s, t) => s + t.amount, 0);
    const personalOnCard = txs.filter(t => t.walletType === 'personal').reduce((s, t) => s + t.amount, 0);
    const unpaid = Store.getCardUnpaidAmount(cardId);
    const info = Store.getNextPaymentInfo(card);
    const groups = Utils.groupByDate(txs);

    return `
      <button class="back-btn" onclick="Pages.closeCardStatement()">← 返回信用卡</button>

      <div class="credit-card-visual" style="background:${card.color}" onclick="Pages.showCardDetail('${card.id}')">
        <div>
          <div class="cc-name">${esc(card.name)}</div>
          <div class="cc-number">•••• •••• •••• ${esc(card.lastFourDigits || '****')}</div>
        </div>
        <div class="cc-bottom">
          <div>
            <div class="cc-label">結帳日 / 扣款日</div>
            <div class="cc-value">${card.statementDay}號 / ${card.paymentDay}號</div>
          </div>
          <div class="cc-unpaid">
            <div class="cc-label">待繳金額</div>
            <div class="cc-unpaid-amount">${Utils.formatAmount(unpaid)}</div>
          </div>
        </div>
      </div>

      <div class="month-nav">
        <button onclick="Pages.prevMonth()">‹</button>
        <span>${Utils.getMonthLabel(currentYear, currentMonth)}</span>
        <button onclick="Pages.nextMonth()">›</button>
      </div>

      <div class="quick-stats">
        <div class="quick-stat">
          <div class="quick-stat-label">本月卡消費</div>
          <div class="quick-stat-value expense">${Utils.formatAmount(totalOnCard)}</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-label">其中共用</div>
          <div class="quick-stat-value" style="color:var(--primary)">${Utils.formatAmount(sharedOnCard)}</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-label">其中個人</div>
          <div class="quick-stat-value" style="color:var(--warning)">${Utils.formatAmount(personalOnCard)}</div>
        </div>
      </div>

      <div class="card" style="margin-top:4px">
        <div class="card-title">本月刷卡明細（含共用支出）</div>
        ${groups.length > 0 ? groups.map(([date, txList]) => `
          <div class="tx-date-header" style="padding-top:8px">${Utils.formatFullDate(date)}</div>
          ${txList.map(tx => renderTxItem(tx)).join('')}
        `).join('') : `
          <div class="empty-state" style="padding:24px 0">
            <div class="empty-state-text">這個月沒有刷卡紀錄</div>
          </div>
        `}
      </div>

      <div style="text-align:center;margin-top:12px">
        <button class="btn btn-ghost" onclick="Pages.showCardDetail('${card.id}')" style="font-size:13px">
          ✏️ 編輯卡片設定
        </button>
      </div>
    `;
  }

  function viewCardStatement(cardId) {
    cardViewId = cardId;
    App.navigate('cardStatement');
  }

  function closeCardStatement() {
    cardViewId = null;
    App.navigate('creditCards');
  }

  function getAccountsForAssetView() {
    return assetView === 'house_fund' ? Store.getHouseFundAccounts() : Store.getMyAccounts();
  }

  function getStocksForAssetView() {
    return Store.getStocks(assetView);
  }

  function setAssetView(view) {
    assetView = view;
    localStorage.setItem(ASSET_VIEW_KEY, view);
    App.refresh();
  }

  function openHouseFundAssets() {
    setAssetView('house_fund');
    App.navigate('wallet');
  }

  // ──────────── Wallet (個人 / 買房基金資產) ────────────
  function renderWallet() {
    if (assetView === 'house_fund') return renderHouseFundWallet();
    const viewAccounts = getAccountsForAssetView();
    const totalBalance = viewAccounts.reduce((s, a) => s + (a.balance || 0), 0);
    const myStocks = Store.getStocks('personal');
    const usStocks = myStocks.filter(s => (s.market || 'us') === 'us');
    const twStocks = myStocks.filter(s => s.market === 'tse' || s.market === 'otc');
    const twStockValue = Utils.sumStocksMarketValueTw(myStocks);
    const usStockValue = Utils.sumStocksMarketValueUsd(myStocks);
    const twAssets = totalBalance + twStockValue;
    const usAssets = usStockValue;
    const usTotalValue = Utils.sumStocksMarketValueUsd(usStocks);
    const usTotalCost = Utils.sumStocksCostUsd(usStocks);
    const twTotalValue = Utils.sumStocksMarketValueTw(twStocks);
    const twTotalCost = Utils.sumStocksCostTw(twStocks);
    const usPnl = usTotalValue - usTotalCost;
    const twPnl = twTotalValue - twTotalCost;

    const renderStockGroup = (stocks) => {
      if (stocks.length === 0) return '';
      return stocks.map(stock => {
        const m = stock.market || 'us';
        const cost = Utils.stockCostNative(stock);
        const mktVal = Utils.stockMarketValueNative(stock);
        const spnl = mktVal - cost;
        const pnlPct = cost > 0 ? (spnl / cost * 100) : 0;
        const fmt = (v) => Utils.formatStockPrice(v, m);
        return `
          <div class="stock-card" onclick="Pages.showStockDetail('${stock.id}')">
            <div class="stock-card-top">
              <div class="stock-card-info">
                <div class="stock-card-symbol">${esc(stock.symbol)} <span class="stock-market-tag ${m}">${Utils.getMarketLabel(m)}</span></div>
                <div class="stock-card-name">${esc(stock.name || stock.symbol)}</div>
              </div>
              <div class="stock-card-price">
                <div class="stock-card-current">${fmt(stock.currentPrice)}</div>
                ${stock.lastUpdated ? `<div class="stock-card-updated">${new Date(stock.lastUpdated).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
              </div>
            </div>
            <div class="stock-card-bottom">
              <span>${stock.shares} 股 ・ 均價 ${fmt(stock.avgCost)}</span>
              <span class="stock-pnl ${spnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(spnl, m)} (${spnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>
            </div>
          </div>
        `;
      }).join('');
    };

    const twParts = [
      totalBalance > 0 ? `現金 ${Utils.formatAmount(totalBalance)}` : '',
      twStockValue > 0 ? `台股 ${Utils.formatStockPrice(twStockValue, 'tse')}` : '',
    ];
    const usParts = [
      usStockValue > 0 ? `美股 ${Utils.formatUSD(usStockValue)}` : '',
    ];

    return `
      ${renderAssetViewTabs('personal')}

      ${renderAssetDualHero('個人資產', twAssets, usAssets, twParts, usParts)}

      <div class="wallet-section-title">帳戶</div>

      ${viewAccounts.length === 0 ? `
        <div class="asset-empty-card">
          <div class="asset-empty-icon">👤</div>
          <div class="asset-empty-title">尚無個人帳戶</div>
          <div class="asset-empty-desc">例如：薪轉戶、活存</div>
          <button type="button" class="btn btn-primary asset-empty-btn" onclick="Pages.showAddAccount()">
            + 新增帳戶
          </button>
        </div>
      ` : viewAccounts.map(account => `
        <div class="account-card" onclick="Pages.showAccountDetail('${account.id}')">
          <div class="account-card-top">
            <div class="account-card-icon">${esc(account.icon)}</div>
            <div class="account-card-info">
              <div class="account-card-name">${esc(account.name)}</div>
            </div>
            <div class="account-card-balance ${(account.balance || 0) >= 0 ? 'positive' : 'negative'}">
              ${Utils.formatAmount(account.balance || 0)}
            </div>
          </div>
          <div class="account-card-actions">
            <button class="account-action-btn" onclick="event.stopPropagation();Pages.showAdjustBalance('${account.id}', 'income')">+ 收入入帳</button>
            <button class="account-action-btn" onclick="event.stopPropagation();Pages.showAdjustBalance('${account.id}', 'expense')">- 手動扣款</button>
            <button class="account-action-btn" onclick="event.stopPropagation();Pages.showAdjustBalance('${account.id}', 'set')">✏️ 更新餘額</button>
          </div>
        </div>
      `).join('')}

      ${viewAccounts.length > 0 ? `
        <button class="add-card-btn" onclick="Pages.showAddAccount()">+ 新增帳戶</button>
      ` : ''}

      <div class="wallet-section-title" style="margin-top:20px">
        股票庫存
        ${myStocks.length > 0 ? `<button class="stock-refresh-btn" onclick="Pages.refreshAllStockPrices()">🔄 更新報價</button>` : ''}
      </div>

      ${myStocks.length > 0 ? `
        ${usStocks.length > 0 ? `
          <div class="collapsible-panel">
            <div class="collapsible-header" onclick="Pages.togglePanel(this)">
              <div class="collapsible-title">🇺🇸 美股 <span class="collapsible-count">${usStocks.length} 支</span></div>
              <div class="collapsible-summary">
                <span>市值 ${Utils.formatUSD(usTotalValue)}</span>
                <span class="stock-pnl ${usPnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(usPnl, 'us')}</span>
              </div>
              <div class="collapsible-arrow">▾</div>
            </div>
            <div class="collapsible-body collapsed">
              <div class="stock-summary">
                <div class="stock-summary-item">
                  <div class="stock-summary-label">市值（美金）</div>
                  <div class="stock-summary-value">${Utils.formatUSD(usTotalValue)}</div>
                </div>
                <div class="stock-summary-item">
                  <div class="stock-summary-label">成本（美金）</div>
                  <div class="stock-summary-value">${Utils.formatUSD(usTotalCost)}</div>
                </div>
                <div class="stock-summary-item">
                  <div class="stock-summary-label">損益（美金）</div>
                  <div class="stock-summary-value ${usPnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(usPnl, 'us')}</div>
                </div>
              </div>
              ${renderStockGroup(usStocks)}
            </div>
          </div>
        ` : ''}

        ${twStocks.length > 0 ? `
          <div class="collapsible-panel">
            <div class="collapsible-header" onclick="Pages.togglePanel(this)">
              <div class="collapsible-title">🇹🇼 台股 <span class="collapsible-count">${twStocks.length} 支</span></div>
              <div class="collapsible-summary">
                <span>市值 ${Utils.formatStockPrice(twTotalValue, 'tse')}</span>
                <span class="stock-pnl ${twPnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(twPnl, 'tse')}</span>
              </div>
              <div class="collapsible-arrow">▾</div>
            </div>
            <div class="collapsible-body collapsed">
              <div class="stock-summary">
                <div class="stock-summary-item">
                  <div class="stock-summary-label">市值</div>
                  <div class="stock-summary-value">${Utils.formatStockPrice(twTotalValue, 'tse')}</div>
                </div>
                <div class="stock-summary-item">
                  <div class="stock-summary-label">成本</div>
                  <div class="stock-summary-value">${Utils.formatStockPrice(twTotalCost, 'tse')}</div>
                </div>
                <div class="stock-summary-item">
                  <div class="stock-summary-label">損益</div>
                  <div class="stock-summary-value ${twPnl >= 0 ? 'positive' : 'negative'}">${twPnl >= 0 ? '+' : ''}${Utils.formatStockPrice(twPnl, 'tse')}</div>
                </div>
              </div>
              ${renderStockGroup(twStocks)}
            </div>
          </div>
        ` : ''}
      ` : `
        <div class="asset-empty-card">
          <div class="asset-empty-icon">📈</div>
          <div class="asset-empty-title">尚無股票庫存</div>
          <div class="asset-empty-desc">新增後可記錄買進、賣出</div>
          <button type="button" class="btn btn-primary asset-empty-btn" onclick="Pages.showAddStock()">
            + 新增股票
          </button>
        </div>
      `}

      ${myStocks.length > 0 ? `
        <button class="add-card-btn" onclick="Pages.showAddStock()">+ 新增股票</button>
      ` : ''}
    `;
  }

  function renderAssetViewTabs(active) {
    return `
      <div class="ledger-tabs" style="margin-bottom:12px">
        <button class="ledger-tab ${active === 'personal' ? 'active' : ''}" onclick="Pages.setAssetView('personal')">
          <span class="ledger-tab-icon">👤</span>
          <span class="ledger-tab-name">個人資產</span>
        </button>
        <button class="ledger-tab ${active === 'house_fund' ? 'active' : ''}" onclick="Pages.setAssetView('house_fund')">
          <span class="ledger-tab-icon">🏠</span>
          <span class="ledger-tab-name">買房基金</span>
        </button>
      </div>
    `;
  }

  function renderAssetDualHero(title, twTotal, usdTotal, twParts, usdParts) {
    const twLine = (twParts || []).filter(Boolean).join(' ・ ');
    const usdLine = (usdParts || []).filter(Boolean).join(' ・ ');
    const showUsd = usdTotal > 0 || usdLine;
    return `
      <div class="card asset-dual-card">
        <div class="card-title" style="text-align:center">${title}</div>
        <div class="asset-dual-rows">
          <div class="asset-dual-row">
            <span class="asset-dual-label">🇹🇼 台幣資產</span>
            <span class="asset-dual-value">${Utils.formatAmount(twTotal)}</span>
          </div>
          ${showUsd ? `
            <div class="asset-dual-row">
              <span class="asset-dual-label">🇺🇸 美金資產</span>
              <span class="asset-dual-value usd">${Utils.formatUSD(usdTotal)}</span>
            </div>
          ` : ''}
        </div>
        ${twLine || usdLine ? `
          <div class="asset-dual-detail">
            ${twLine ? `<div>台幣：${twLine}</div>` : ''}
            ${usdLine ? `<div>美金：${usdLine}</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderHouseFundDepositCard(field, icon, label, amount) {
    return `
      <div class="deposit-card">
        <div class="deposit-card-top">
          <div class="deposit-card-icon">${icon}</div>
          <div class="deposit-card-info">
            <div class="deposit-card-label">${label}</div>
            <div class="deposit-card-amount">${Utils.formatAmount(amount)}</div>
          </div>
        </div>
        <div class="deposit-card-actions">
          <button type="button" class="account-action-btn" onclick="Pages.showEditHouseFundDeposit('${field}', 'income')">+ 存入</button>
          <button type="button" class="account-action-btn" onclick="Pages.showEditHouseFundDeposit('${field}', 'expense')">- 提出</button>
          <button type="button" class="account-action-btn" onclick="Pages.showEditHouseFundDeposit('${field}', 'set')">✏️ 設定餘額</button>
        </div>
      </div>
    `;
  }

  function renderHouseFundWallet() {
    const balances = Store.getHouseFundBalances();
    const myStocks = Store.getStocks('house_fund');
    const usStocks = myStocks.filter(s => (s.market || 'us') === 'us');
    const twStocks = myStocks.filter(s => s.market === 'tse' || s.market === 'otc');
    const twStockValue = Utils.sumStocksMarketValueTw(myStocks);
    const usStockValue = Utils.sumStocksMarketValueUsd(myStocks);
    const twAssets = balances.cashDeposit + twStockValue;
    const usAssets = usStockValue;
    const usTotalValue = Utils.sumStocksMarketValueUsd(usStocks);
    const usTotalCost = Utils.sumStocksCostUsd(usStocks);
    const twTotalValue = Utils.sumStocksMarketValueTw(twStocks);
    const twTotalCost = Utils.sumStocksCostTw(twStocks);
    const usPnl = usTotalValue - usTotalCost;
    const twPnl = twTotalValue - twTotalCost;

    const renderStockGroup = (stocks) => {
      if (stocks.length === 0) return '';
      return stocks.map(stock => {
        const m = stock.market || 'us';
        const cost = Utils.stockCostNative(stock);
        const mktVal = Utils.stockMarketValueNative(stock);
        const spnl = mktVal - cost;
        const pnlPct = cost > 0 ? (spnl / cost * 100) : 0;
        const fmt = (v) => Utils.formatStockPrice(v, m);
        return `
          <div class="stock-card" onclick="Pages.showStockDetail('${stock.id}')">
            <div class="stock-card-top">
              <div class="stock-card-info">
                <div class="stock-card-symbol">${esc(stock.symbol)} <span class="stock-market-tag ${m}">${Utils.getMarketLabel(m)}</span></div>
                <div class="stock-card-name">${esc(stock.name || stock.symbol)}</div>
              </div>
              <div class="stock-card-price">
                <div class="stock-card-current">${fmt(stock.currentPrice)}</div>
              </div>
            </div>
            <div class="stock-card-bottom">
              <span>${stock.shares} 股 ・ 均價 ${fmt(stock.avgCost)}</span>
              <span class="stock-pnl ${spnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(spnl, m)} (${spnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>
            </div>
          </div>
        `;
      }).join('');
    };

    const twParts = [
      balances.cashDeposit > 0 ? `存款 ${Utils.formatAmount(balances.cashDeposit)}` : '',
      twStockValue > 0 ? `台股 ${Utils.formatStockPrice(twStockValue, 'tse')}` : '',
    ];
    const usParts = [
      usStockValue > 0 ? `美股 ${Utils.formatUSD(usStockValue)}` : '',
    ];

    const depositTxs = Store.getHouseFundDepositTxs(15);

    return `
      ${renderAssetViewTabs('house_fund')}

      ${renderAssetDualHero('買房基金資產', twAssets, usAssets, twParts, usParts)}

      <div class="wallet-section-title">存款</div>
      ${renderHouseFundDepositCard('cashDeposit', '🏦', '資產存款', balances.cashDeposit)}

      <div class="collapsible-panel" style="margin-top:16px">
        <div class="collapsible-header" onclick="Pages.togglePanel(this)">
          <div class="collapsible-title">📋 存入／提出 <span class="collapsible-count">${depositTxs.length} 筆</span></div>
          <div class="collapsible-summary">
            <span>${depositTxs.length > 0 ? `最近 ${Utils.formatDate(depositTxs[0].date)}` : '尚無紀錄'}</span>
          </div>
          <div class="collapsible-arrow">▾</div>
        </div>
        <div class="collapsible-body collapsed">
          ${depositTxs.length > 0 ? `
            <div class="hf-deposit-log">
              ${depositTxs.map(tx => {
                const user = Utils.getUserInfo(tx.userId);
                const sign = tx.type === 'income' ? '+' : '-';
                const action = tx.type === 'income' ? '存入' : '提出';
                return `
                  <div class="hf-deposit-row" onclick="Pages.showTxDetail('${tx.id}')">
                    <div class="hf-deposit-row-left">
                      <span class="hf-deposit-action ${tx.type}">${action}</span>
                      <span class="hf-deposit-user">${esc(user.emoji)} ${esc(user.name)}</span>
                      <span class="hf-deposit-desc">${esc(tx.description || '')}</span>
                    </div>
                    <div class="hf-deposit-row-right">
                      <span class="hf-deposit-amount ${tx.type}">${sign}${Utils.formatAmount(tx.amount)}</span>
                      <span class="hf-deposit-date">${Utils.formatDate(tx.date)}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">
              尚無紀錄，使用上方「存入」或「提出」開始記錄
            </div>
          `}
        </div>
      </div>

      <div class="wallet-section-title" style="margin-top:20px">
        股票持股
        ${myStocks.length > 0 ? `<button class="stock-refresh-btn" onclick="Pages.refreshAllStockPrices()">🔄 更新報價</button>` : ''}
      </div>

      ${myStocks.length > 0 ? `
        ${usStocks.length > 0 ? `
          <div class="collapsible-panel">
            <div class="collapsible-header" onclick="Pages.togglePanel(this)">
              <div class="collapsible-title">🇺🇸 美股 <span class="collapsible-count">${usStocks.length} 支</span></div>
              <div class="collapsible-summary">
                <span>市值 ${Utils.formatUSD(usTotalValue)}</span>
                <span class="stock-pnl ${usPnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(usPnl, 'us')}</span>
              </div>
              <div class="collapsible-arrow">▾</div>
            </div>
            <div class="collapsible-body collapsed">
              <div class="stock-summary" style="margin-bottom:8px">
                <div class="stock-summary-item">
                  <div class="stock-summary-label">市值（美金）</div>
                  <div class="stock-summary-value">${Utils.formatUSD(usTotalValue)}</div>
                </div>
              </div>
              ${renderStockGroup(usStocks)}
            </div>
          </div>
        ` : ''}
        ${twStocks.length > 0 ? `
          <div class="collapsible-panel">
            <div class="collapsible-header" onclick="Pages.togglePanel(this)">
              <div class="collapsible-title">🇹🇼 台股 <span class="collapsible-count">${twStocks.length} 支</span></div>
              <div class="collapsible-summary">
                <span>市值 ${Utils.formatStockPrice(twTotalValue, 'tse')}</span>
                <span class="stock-pnl ${twPnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(twPnl, 'tse')}</span>
              </div>
              <div class="collapsible-arrow">▾</div>
            </div>
            <div class="collapsible-body collapsed">
              ${renderStockGroup(twStocks)}
            </div>
          </div>
        ` : ''}
        <button class="add-card-btn" onclick="Pages.showAddStock()">+ 新增股票</button>
      ` : `
        <div class="asset-empty-card">
          <div class="asset-empty-icon">📈</div>
          <div class="asset-empty-title">尚無持股</div>
          <div class="asset-empty-desc">點股票可買進、賣出或編輯</div>
          <button type="button" class="btn btn-primary asset-empty-btn" onclick="Pages.showAddStock()">+ 新增股票</button>
        </div>
      `}
    `;
  }

  const HOUSE_FUND_DEPOSIT_NAMES = { cashDeposit: '資產存款' };

  function showEditHouseFundDeposit(field, mode) {
    const balances = Store.getHouseFundBalances();
    const label = HOUSE_FUND_DEPOSIT_NAMES[field] || field;
    const current = balances[field] || 0;
    const me = Store.getCurrentUser();
    const settings = Store.getSettings();
    const titles = { income: '存入', expense: '提出', set: '設定餘額' };
    const placeholders = { income: '存入金額', expense: '提出金額', set: '新的餘額' };
    const userLabels = { income: '誰存入', expense: '誰提出' };

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${label} — ${titles[mode]}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="modal-balance-hero">
        <div class="modal-balance-label">目前餘額</div>
        <div class="modal-balance-value">${Utils.formatAmount(current)}</div>
      </div>
      <div class="form-grid">
        ${mode !== 'set' ? `
          <div class="form-field">
            <label>${userLabels[mode]}</label>
            <select id="hf-deposit-user">
              ${settings.users.map(u => `
                <option value="${esc(u.id)}" ${u.id === me ? 'selected' : ''}>${esc(u.emoji)} ${esc(u.name)}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}
        <div class="form-field">
          <label>${placeholders[mode]}</label>
          <input type="number" id="hf-deposit-amount" class="modal-amount-input" placeholder="0" inputmode="decimal" autofocus>
        </div>
        ${mode !== 'set' ? `
          <div class="form-field">
            <label>備註（選填）</label>
            <input type="text" id="hf-deposit-note" placeholder="例：月薪存入、領現提出">
          </div>
        ` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.confirmHouseFundDeposit('${field}', '${mode}')">確認</button>
      </div>
    `);
    setTimeout(() => document.getElementById('hf-deposit-amount')?.focus(), 300);
  }

  function confirmHouseFundDeposit(field, mode) {
    const val = parseFloat(document.getElementById('hf-deposit-amount').value);
    if (isNaN(val) || val < 0) { Utils.showToast('請輸入金額'); return; }
    if (mode !== 'set' && val <= 0) { Utils.showToast('請輸入大於 0 的金額'); return; }

    const balances = Store.getHouseFundBalances();
    const label = HOUSE_FUND_DEPOSIT_NAMES[field];
    const me = Store.getCurrentUser();
    const userId = mode === 'set' ? me : (document.getElementById('hf-deposit-user')?.value || me);
    const user = Utils.getUserInfo(userId);
    const noteEl = document.getElementById('hf-deposit-note');
    const note = noteEl ? noteEl.value.trim() : '';

    if (mode === 'set') {
      Store.setHouseFundBalance(val);
      Utils.showToast(`${label}已更新`);
    } else if (mode === 'income') {
      Store.addTransaction({
        amount: val,
        type: 'income',
        category: 'account_adjust',
        description: note || `${user.name} 存入買房基金`,
        note: '',
        date: Utils.todayStr(),
        userId,
        walletType: 'house_fund',
        creditCardId: '',
        accountId: '',
      });
      Utils.showToast(`${user.emoji} ${user.name} 存入 ${Utils.formatAmount(val)}`);
    } else {
      if (val > (balances[field] || 0)) {
        Utils.showToast('提出金額不能超過目前餘額');
        return;
      }
      Store.addTransaction({
        amount: val,
        type: 'expense',
        category: 'account_adjust',
        description: note || `${user.name} 提出買房基金`,
        note: '',
        date: Utils.todayStr(),
        userId,
        walletType: 'house_fund',
        creditCardId: '',
        accountId: '',
      });
      Utils.showToast(`${user.emoji} ${user.name} 提出 ${Utils.formatAmount(val)}`);
    }

    hideModal();
    App.navigate('wallet');
  }

  function togglePanel(headerEl) {
    const body = headerEl.nextElementSibling;
    const arrow = headerEl.querySelector('.collapsible-arrow');
    body.classList.toggle('collapsed');
    arrow.classList.toggle('open');
  }

  // ──────────── Stock Functions ────────────
  let _symbolLookupTimer = null;

  function showAddStock(editStock) {
    const isEdit = !!editStock;
    const isHouseFund = assetView === 'house_fund';
    const market = editStock?.market || 'us';
    showModal(`
      <div class="modal-header">
        <div class="modal-title">${isEdit ? '編輯股票' : (isHouseFund ? '新增買房基金股票' : '新增股票')}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>市場</label>
          <div class="market-toggle">
            <button type="button" class="market-toggle-btn ${market === 'us' ? 'active' : ''}" onclick="Pages.switchMarket('us')" ${isEdit ? 'disabled' : ''}>🇺🇸 美股</button>
            <button type="button" class="market-toggle-btn ${market === 'tse' ? 'active' : ''}" onclick="Pages.switchMarket('tse')" ${isEdit ? 'disabled' : ''}>🇹🇼 上市</button>
            <button type="button" class="market-toggle-btn ${market === 'otc' ? 'active' : ''}" onclick="Pages.switchMarket('otc')" ${isEdit ? 'disabled' : ''}>🇹🇼 上櫃</button>
          </div>
          <input type="hidden" id="stock-market" value="${market}">
        </div>
        <div class="form-field">
          <label id="stock-symbol-label">股票代號（${market === 'us' ? '例：AAPL、TSLA' : '例：2330、2317'}）</label>
          <input type="text" id="stock-symbol" placeholder="${market === 'us' ? 'AAPL' : '2330'}" value="${esc(editStock?.symbol || '')}" style="text-transform:uppercase" ${isEdit ? 'readonly' : ''}>
          <div id="stock-symbol-status" class="stock-symbol-status"></div>
        </div>
        <div class="form-field">
          <label>股票名稱</label>
          <input type="text" id="stock-name" placeholder="${market === 'us' ? 'Apple Inc.' : '台積電'}" value="${esc(editStock?.name || '')}">
        </div>
        <div class="form-field">
          <label>持有股數</label>
          <input type="number" id="stock-shares" placeholder="0" inputmode="decimal" value="${editStock?.shares || ''}">
        </div>
        <div class="form-field">
          <label id="stock-cost-label">平均成本（${market === 'us' ? 'USD' : 'TWD'}）</label>
          <input type="number" id="stock-cost" placeholder="0.00" inputmode="decimal" step="0.01" value="${editStock?.avgCost || ''}">
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button class="btn btn-danger" onclick="Pages.deleteStock('${editStock.id}')">刪除</button>` : ''}
        <button class="btn btn-primary" onclick="Pages.saveStock('${editStock?.id || ''}')">${isEdit ? '更新' : '新增'}</button>
      </div>
    `);

    if (!isEdit) {
      const symbolInput = document.getElementById('stock-symbol');
      symbolInput.addEventListener('input', () => {
        clearTimeout(_symbolLookupTimer);
        const val = symbolInput.value.trim().toUpperCase();
        if (val.length < 1) return;
        _symbolLookupTimer = setTimeout(() => lookupStockName(val), 600);
      });
    }
  }

  async function lookupStockName(symbol) {
    const market = document.getElementById('stock-market').value;
    const statusEl = document.getElementById('stock-symbol-status');
    const nameInput = document.getElementById('stock-name');
    statusEl.textContent = '查詢中...';
    statusEl.className = 'stock-symbol-status loading';

    if (market === 'tse' || market === 'otc') {
      let result = await fetchTWStockPriceBatch([{ symbol, market }]);
      if (!result[symbol]) {
        const alt = market === 'otc' ? 'tse' : 'otc';
        result = await fetchTWStockPriceBatch([{ symbol, market: alt }]);
        if (result[symbol]) {
          document.getElementById('stock-market').value = alt;
          const btns = document.querySelectorAll('.market-toggle-btn');
          btns.forEach(b => b.classList.remove('active'));
          btns.forEach(b => { if (b.textContent.includes(alt === 'tse' ? '上市' : '上櫃')) b.classList.add('active'); });
        }
      }
      const r = result[symbol];
      if (r && r.name) {
        nameInput.value = r.name;
        statusEl.textContent = `✓ ${r.name}`;
        statusEl.className = 'stock-symbol-status found';
      } else {
        statusEl.textContent = '找不到此代號';
        statusEl.className = 'stock-symbol-status not-found';
      }
    } else {
      const apiKey = Store.getFinnhubKey();
      if (!apiKey) {
        statusEl.textContent = '請先設定 Finnhub API Key';
        statusEl.className = 'stock-symbol-status not-found';
        return;
      }
      try {
        const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`);
        const data = await res.json();
        if (data && data.name) {
          nameInput.value = data.name;
          statusEl.textContent = `✓ ${data.name}`;
          statusEl.className = 'stock-symbol-status found';
        } else {
          statusEl.textContent = '找不到此代號';
          statusEl.className = 'stock-symbol-status not-found';
        }
      } catch (e) {
        statusEl.textContent = '查詢失敗';
        statusEl.className = 'stock-symbol-status not-found';
      }
    }
  }

  function switchMarket(market) {
    const btns = document.querySelectorAll('.market-toggle-btn');
    btns.forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('stock-market').value = market;

    const isTW = market === 'tse' || market === 'otc';
    document.getElementById('stock-symbol-label').textContent =
      isTW ? '股票代號（例：2330、2317）' : '股票代號（例：AAPL、TSLA）';
    document.getElementById('stock-symbol').placeholder = isTW ? '2330' : 'AAPL';
    document.getElementById('stock-name').placeholder = isTW ? '台積電' : 'Apple Inc.';
    document.getElementById('stock-cost-label').textContent =
      isTW ? '平均成本（TWD）' : '平均成本（USD）';

    document.getElementById('stock-symbol').value = '';
    document.getElementById('stock-name').value = '';
    document.getElementById('stock-symbol-status').textContent = '';
  }

  function saveStock(editId) {
    const symbol = document.getElementById('stock-symbol').value.trim().toUpperCase();
    if (!symbol) { Utils.showToast('請輸入股票代號'); return; }

    const market = document.getElementById('stock-market').value;
    const stock = {
      symbol,
      market,
      name: document.getElementById('stock-name').value.trim(),
      shares: parseFloat(document.getElementById('stock-shares').value) || 0,
      avgCost: parseFloat(document.getElementById('stock-cost').value) || 0,
    };

    stock.assetScope = assetView;

    if (editId) {
      Store.updateStock(editId, stock);
      Utils.showToast('已更新');
    } else {
      Store.addStock(stock);
      Utils.showToast('已新增股票');
    }

    hideModal();
    App.navigate('wallet');
    fetchSingleStockPrice(stock);
  }

  function deleteStock(id) {
    if (confirm('確定要刪除這支股票嗎？交易紀錄也會一併刪除。')) {
      Store.deleteStock(id);
      hideModal();
      Utils.showToast('已刪除');
      App.navigate('wallet');
    }
  }

  function showStockDetail(stockId) {
    const stock = Store.getAllStocks().find(s => s.id === stockId);
    if (!stock) return;

    const txs = Store.getStockTransactions(stockId);
    const m = stock.market || 'us';
    const fmt = (v) => Utils.formatStockPrice(v, m);
    const mktVal = Utils.stockMarketValueNative(stock);
    const cost = Utils.stockCostNative(stock);
    const pnl = mktVal - cost;
    const pnlPct = cost > 0 ? (pnl / cost * 100) : 0;
    const valueFmt = Utils.isTwMarket(m)
      ? (v) => Utils.formatStockPrice(v, m)
      : Utils.formatUSD;

    showModal(`
      <div class="modal-header">
        <div class="modal-title">📈 ${esc(stock.symbol)} <span class="stock-market-tag ${m}">${Utils.getMarketLabel(m)}</span></div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="stock-detail-hero">
        <div class="stock-detail-name">${esc(stock.name || stock.symbol)}</div>
        <div class="stock-detail-price">${fmt(stock.currentPrice)}</div>
        ${stock.lastUpdated ? `<div class="stock-detail-time">更新於 ${new Date(stock.lastUpdated).toLocaleString('zh-TW')}</div>` : ''}
      </div>

      <div class="stock-detail-grid">
        <div class="stock-detail-item">
          <div class="stock-detail-label">持有股數</div>
          <div class="stock-detail-val">${stock.shares}</div>
        </div>
        <div class="stock-detail-item">
          <div class="stock-detail-label">平均成本</div>
          <div class="stock-detail-val">${fmt(stock.avgCost)}</div>
        </div>
        <div class="stock-detail-item">
          <div class="stock-detail-label">市值</div>
          <div class="stock-detail-val">${valueFmt(mktVal)}</div>
        </div>
        <div class="stock-detail-item">
          <div class="stock-detail-label">損益</div>
          <div class="stock-detail-val ${pnl >= 0 ? 'positive' : 'negative'}">${Utils.formatStockPnl(pnl, m)} (${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</div>
        </div>
      </div>

      <div class="modal-actions" style="margin-bottom:16px">
        <button class="btn btn-primary" onclick="Pages.showBuySellStock('${stockId}', 'buy')" style="flex:1">買進</button>
        <button class="btn btn-danger" onclick="Pages.showBuySellStock('${stockId}', 'sell')" style="flex:1">賣出</button>
      </div>

      ${txs.length > 0 ? `
        <div style="font-size:13px;font-weight:700;margin-bottom:8px">交易紀錄</div>
        ${txs.slice(0, 10).map(tx => `
          <div class="stock-tx-item">
            <div class="stock-tx-type ${tx.type}">${tx.type === 'buy' ? '買進' : '賣出'}</div>
            <div class="stock-tx-info">${tx.shares} 股 @ ${fmt(tx.price)}</div>
            <div class="stock-tx-date">${Utils.formatDate(tx.date)}</div>
          </div>
        `).join('')}
      ` : ''}

      <div class="modal-actions" style="margin-top:12px">
        <button class="btn btn-ghost" onclick="Pages.showAddStock(Store.getAllStocks().find(s=>s.id==='${stockId}'))">✏️ 編輯</button>
        <button class="btn btn-ghost" onclick="Pages.fetchAndRefresh('${stockId}')">🔄 更新報價</button>
      </div>
    `);
  }

  function showBuySellStock(stockId, type) {
    const stock = Store.getAllStocks().find(s => s.id === stockId);
    if (!stock) return;
    const m = stock.market || 'us';
    const currLabel = (m === 'tse' || m === 'otc') ? 'TWD' : 'USD';

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${type === 'buy' ? '買進' : '賣出'} ${esc(stock.symbol)}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>股數</label>
          <input type="number" id="stx-shares" placeholder="${(m === 'tse' || m === 'otc') ? '1000' : '0'}" inputmode="decimal" autofocus>
        </div>
        <div class="form-field">
          <label>成交價（${currLabel}）</label>
          <input type="number" id="stx-price" placeholder="0.00" inputmode="decimal" step="0.01" value="${stock.currentPrice.toFixed(2)}">
        </div>
        <div class="form-field">
          <label>日期</label>
          <input type="date" id="stx-date" value="${Utils.todayStr()}">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn ${type === 'buy' ? 'btn-primary' : 'btn-danger'}" onclick="Pages.saveStockTx('${stockId}', '${type}')">
          確認${type === 'buy' ? '買進' : '賣出'}
        </button>
      </div>
    `);
    setTimeout(() => document.getElementById('stx-shares')?.focus(), 300);
  }

  function saveStockTx(stockId, type) {
    const shares = parseFloat(document.getElementById('stx-shares').value);
    if (!shares || shares <= 0) { Utils.showToast('請輸入股數'); return; }

    const price = parseFloat(document.getElementById('stx-price').value);
    if (!price || price <= 0) { Utils.showToast('請輸入成交價'); return; }

    const stock = Store.getAllStocks().find(s => s.id === stockId);
    if (type === 'sell' && stock && shares > stock.shares) {
      Utils.showToast('賣出股數不能超過持有股數'); return;
    }

    Store.addStockTransaction({
      stockId,
      symbol: stock?.symbol || '',
      type,
      shares,
      price,
      date: document.getElementById('stx-date').value || Utils.todayStr(),
    });

    Utils.showToast(`已記錄${type === 'buy' ? '買進' : '賣出'}`);
    hideModal();
    App.navigate('wallet');
  }

  function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  async function fetchUSStockPrice(symbol) {
    const apiKey = Store.getFinnhubKey();
    if (!apiKey) return null;
    try {
      const res = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      const data = await res.json();
      return (data.c && data.c > 0) ? data.c : null;
    } catch (e) {
      console.warn('US stock price fetch failed:', e);
      return null;
    }
  }

  function parseTWStockRow(row) {
    const price = parseFloat(row.z);
    if (!isNaN(price) && price > 0) return { price, name: row.n, symbol: row.c };
    const y = parseFloat(row.y);
    if (!isNaN(y) && y > 0) return { price: y, name: row.n, symbol: row.c };
    const o = parseFloat(row.o);
    if (!isNaN(o) && o > 0) return { price: o, name: row.n, symbol: row.c };
    return null;
  }

  async function fetchTWStockPriceBatch(stockList) {
    if (stockList.length === 0) return {};

    const queryParts = stockList.map(s => {
      const ex = s.market === 'otc' ? 'otc' : 'tse';
      return `${ex}_${s.symbol}.tw`;
    });
    const twseUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${queryParts.join('|')}`;

    const proxies = [
      (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    ];

    for (const makeUrl of proxies) {
      try {
        const res = await fetchWithTimeout(makeUrl(twseUrl), 10000);
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { continue; }

        if (data.msgArray && data.msgArray.length > 0) {
          const results = {};
          for (const row of data.msgArray) {
            const parsed = parseTWStockRow(row);
            if (parsed) results[row.c] = parsed;
          }
          if (Object.keys(results).length > 0) return results;
        }
      } catch (e) {
        console.warn('TW batch proxy failed, trying next:', e.message);
      }
    }
    return {};
  }

  async function fetchTWStockPrice(symbol, exchange) {
    const result = await fetchTWStockPriceBatch([{ symbol, market: exchange }]);
    if (result[symbol]) return result[symbol];

    const altExchange = exchange === 'otc' ? 'tse' : 'otc';
    const altResult = await fetchTWStockPriceBatch([{ symbol, market: altExchange }]);
    if (altResult[symbol]) {
      console.info(`${symbol}: found on ${altExchange} instead of ${exchange}`);
      return altResult[symbol];
    }
    return null;
  }

  async function fetchSingleStockPrice(stockInfo) {
    const stock = stockInfo.id
      ? stockInfo
      : Store.getAllStocks().find(s => s.symbol === stockInfo.symbol && s.market === stockInfo.market);
    if (!stock) return null;

    const market = stock.market || 'us';
    let price = null;

    if (market === 'us') {
      if (!Store.getFinnhubKey()) return null;
      price = await fetchUSStockPrice(stock.symbol);
    } else {
      const result = await fetchTWStockPrice(stock.symbol, market);
      if (result) {
        price = result.price;
        if (result.name && !stock.name) {
          Store.updateStock(stock.id, { name: result.name });
        }
      }
    }

    if (price) {
      Store.updateStock(stock.id, {
        currentPrice: price,
        lastUpdated: new Date().toISOString(),
      });
    }
    return price;
  }

  async function refreshAllStockPrices() {
    const stocks = getStocksForAssetView();
    if (stocks.length === 0) return;

    const usStocks = stocks.filter(s => (s.market || 'us') === 'us');
    const twStocks = stocks.filter(s => s.market === 'tse' || s.market === 'otc');

    if (usStocks.length > 0 && !Store.getFinnhubKey()) {
      Utils.showToast('美股需要 Finnhub API Key，台股可直接更新');
    }

    Utils.showToast('正在更新報價...');
    let updated = 0;

    const twPromise = (async () => {
      if (twStocks.length === 0) return;

      let results = await fetchTWStockPriceBatch(twStocks);

      const missing = twStocks.filter(s => !results[s.symbol]);
      if (missing.length > 0) {
        const retryList = missing.map(s => ({
          symbol: s.symbol,
          market: s.market === 'otc' ? 'tse' : 'otc',
        }));
        const retryResults = await fetchTWStockPriceBatch(retryList);
        Object.assign(results, retryResults);
      }

      for (const stock of twStocks) {
        const r = results[stock.symbol];
        if (r) {
          Store.updateStock(stock.id, {
            currentPrice: r.price,
            lastUpdated: new Date().toISOString(),
          });
          if (r.name && !stock.name) {
            Store.updateStock(stock.id, { name: r.name });
          }
          updated++;
        }
      }
    })();

    const usPromise = (async () => {
      if (usStocks.length === 0 || !Store.getFinnhubKey()) return;
      for (const stock of usStocks) {
        const price = await fetchUSStockPrice(stock.symbol);
        if (price) {
          Store.updateStock(stock.id, {
            currentPrice: price,
            lastUpdated: new Date().toISOString(),
          });
          updated++;
        }
        if (usStocks.length > 1) await new Promise(r => setTimeout(r, 200));
      }
    })();

    await Promise.all([twPromise, usPromise]);

    Utils.showToast(`已更新 ${updated} 支股票報價`);
    App.navigate('wallet');
  }

  async function fetchAndRefresh(stockId) {
    Utils.showToast('更新中...');
    const stock = Store.getAllStocks().find(s => s.id === stockId);
    if (!stock) return;
    const price = await fetchSingleStockPrice(stock);
    if (price) {
      const currency = (stock.market === 'tse' || stock.market === 'otc') ? 'NT$' : '$';
      Utils.showToast(`${stock.symbol} 最新價格 ${currency}${price.toFixed(2)}`);
      showStockDetail(stockId);
    } else {
      Utils.showToast('更新失敗，請確認股票代號是否正確');
    }
  }

  // ──────────── Accounts (kept for internal use) ────────────
  function renderAccounts() {
    return renderWallet();
  }

  function showAddAccount(editAccount) {
    const isEdit = !!editAccount;
    const isHouseFund = assetView === 'house_fund';
    const ACCOUNT_ICONS = ['🏦', '💰', '🏧', '💳', '🐷', '📱', '💵', '🪙'];

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${isEdit ? '編輯帳戶' : (isHouseFund ? '新增買房基金帳戶' : '新增帳戶')}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>帳戶名稱</label>
          <input type="text" id="acct-name" placeholder="例：台新銀行" value="${esc(editAccount?.name || '')}">
        </div>
        <div class="form-field">
          <label>圖示</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${ACCOUNT_ICONS.map(icon => `
              <button type="button" onclick="document.querySelectorAll('.icon-opt').forEach(e=>{e.style.outline='';e.style.background=''});this.style.outline='3px solid var(--primary)';this.style.background='rgba(108,92,231,0.1)';document.getElementById('acct-icon-val').value='${icon}'"
                class="icon-opt" style="width:40px;height:40px;border-radius:8px;border:1.5px solid var(--border);font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--card);
                ${editAccount?.icon === icon ? 'outline:3px solid var(--primary);background:rgba(108,92,231,0.1)' : ''}">${icon}</button>
            `).join('')}
          </div>
          <input type="hidden" id="acct-icon-val" value="${editAccount?.icon || '🏦'}">
        </div>
        <div class="form-field">
          <label>目前餘額</label>
          <input type="number" id="acct-balance" placeholder="0" inputmode="decimal" value="${editAccount?.balance || ''}">
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button class="btn btn-danger" onclick="Pages.deleteAccount('${editAccount.id}')">刪除</button>` : ''}
        <button class="btn btn-primary" onclick="Pages.saveAccount('${editAccount?.id || ''}')">${isEdit ? '更新' : '新增'}</button>
      </div>
    `);
  }

  function showEditAccount(accountId) {
    const account = Store.getAccounts().find(a => a.id === accountId);
    if (!account) return;
    showAddAccount(account);
  }

  function showAccountDetail(accountId) {
    const account = Store.getAccounts().find(a => a.id === accountId);
    if (!account) return;

    const allTxs = Store.getTransactions();
    const accountTxs = allTxs
      .filter(tx => tx.accountId === accountId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 20);

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${esc(account.icon)} ${esc(account.name)}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="modal-balance-hero">
        <div class="modal-balance-label">目前餘額</div>
        <div class="modal-balance-value" style="color:${(account.balance || 0) >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}">${Utils.formatAmount(account.balance || 0)}</div>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:16px">
        <button class="account-action-btn" onclick="Pages.hideModal();Pages.showAdjustBalance('${accountId}','income')">+ 入帳</button>
        <button class="account-action-btn" onclick="Pages.hideModal();Pages.showAdjustBalance('${accountId}','expense')">- 扣款</button>
        <button class="account-action-btn" onclick="Pages.hideModal();Pages.showAdjustBalance('${accountId}','set')">✏️ 設定</button>
      </div>

      <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text-primary)">最近帳戶紀錄</div>

      ${accountTxs.length > 0 ? `
        <div class="account-tx-list">
          ${accountTxs.map(tx => {
            const cat = Utils.getCategoryInfo(tx.category, tx.type);
            const sign = tx.type === 'income' ? '+' : '-';
            return `
              <div class="account-tx-row" onclick="Pages.hideModal();Pages.showTxDetail('${tx.id}')">
                <div class="account-tx-icon" style="background:${tx.type === 'income' ? '#E8F5E9' : '#FFEBEE'}">${esc(cat.icon)}</div>
                <div class="account-tx-info">
                  <div class="account-tx-desc">${esc(tx.description || cat.name)}</div>
                  <div class="account-tx-date">${Utils.formatDate(tx.date)}</div>
                </div>
                <div class="account-tx-amount ${tx.type}">${sign}${Utils.formatAmount(tx.amount)}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">
          尚無帳戶紀錄
        </div>
      `}

      <div class="modal-actions" style="margin-top:12px">
        <button class="btn btn-ghost" onclick="Pages.hideModal();Pages.showEditAccount('${accountId}')">✏️ 編輯帳戶</button>
      </div>
    `);
  }

  function saveAccount(editId) {
    const name = document.getElementById('acct-name').value.trim();
    if (!name) { Utils.showToast('請輸入帳戶名稱'); return; }

    const me = Store.getCurrentUser();
    const account = {
      name,
      icon: document.getElementById('acct-icon-val').value,
      balance: parseFloat(document.getElementById('acct-balance').value) || 0,
      assetScope: assetView,
      ownerId: assetView === 'house_fund' ? 'house_fund' : me,
    };

    if (editId) {
      Store.updateAccount(editId, account);
      Utils.showToast('已更新帳戶');
    } else {
      Store.addAccount(account);
      Utils.showToast('已新增帳戶！');
    }
    hideModal();
    App.navigate('wallet');
  }

  function deleteAccount(id) {
    if (confirm('確定要刪除這個帳戶嗎？')) {
      const cards = Store.getMyCreditCards().filter(c => c.linkedAccountId === id);
      cards.forEach(c => Store.updateCreditCard(c.id, { linkedAccountId: '' }));
      Store.deleteAccount(id);
      hideModal();
      Utils.showToast('已刪除帳戶');
      App.navigate('wallet');
    }
  }

  function showAdjustBalance(accountId, mode) {
    const account = Store.getAccounts().find(a => a.id === accountId);
    if (!account) return;

    const titles = { income: '收入入帳', expense: '手動扣款', set: '更新餘額' };
    const placeholders = { income: '入帳金額', expense: '扣款金額', set: '新的餘額' };

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${esc(account.icon)} ${esc(account.name)} — ${titles[mode]}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="modal-balance-hero">
        <div class="modal-balance-label">目前餘額</div>
        <div class="modal-balance-value">${Utils.formatAmount(account.balance || 0)}</div>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>${placeholders[mode]}</label>
          <input type="number" id="adjust-amount" class="modal-amount-input" placeholder="0" inputmode="decimal" autofocus>
        </div>
        ${mode !== 'set' ? `
          <div class="form-field">
            <label>備註（選填）</label>
            <input type="text" id="adjust-note" placeholder="例：${mode === 'income' ? '4月薪水' : '繳房租'}">
          </div>
        ` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.confirmAdjust('${accountId}', '${mode}')">確認</button>
      </div>
    `);
    setTimeout(() => document.getElementById('adjust-amount')?.focus(), 300);
  }

  function confirmAdjust(accountId, mode) {
    const val = parseFloat(document.getElementById('adjust-amount').value);
    if (isNaN(val)) { Utils.showToast('請輸入金額'); return; }
    if (mode !== 'set' && val <= 0) { Utils.showToast('請輸入大於 0 的金額'); return; }

    const account = Store.getAccounts().find(a => a.id === accountId);
    if (!account) return;

    const noteEl = document.getElementById('adjust-note');
    const note = noteEl ? noteEl.value.trim() : '';

    const isHouseFundAcct = (account.assetScope || 'personal') === 'house_fund';
    const walletType = isHouseFundAcct ? 'house_fund' : 'personal';

    if (mode === 'set') {
      Store.updateAccount(accountId, { balance: val });
      Utils.showToast('餘額已更新');
    } else if (mode === 'income') {
      // 帳戶餘額由 Store.addTransaction 依 accountId 自動調整，這裡不再手動調
      Store.addTransaction({
        amount: val,
        type: 'income',
        category: 'account_adjust',
        description: note || `${account.name} 手動入帳`,
        note: '',
        date: Utils.todayStr(),
        userId: Store.getCurrentUser(),
        walletType,
        creditCardId: '',
        accountId: accountId,
      });
      Utils.showToast(`已入帳 ${Utils.formatAmount(val)}`);
    } else {
      Store.addTransaction({
        amount: val,
        type: 'expense',
        category: 'account_adjust',
        description: note || `${account.name} 手動扣款`,
        note: '',
        date: Utils.todayStr(),
        userId: Store.getCurrentUser(),
        walletType,
        creditCardId: '',
        accountId: accountId,
      });
      Utils.showToast(`已扣款 ${Utils.formatAmount(val)}`);
    }

    hideModal();
    App.navigate('wallet');
  }

  // ──────────── Settings ────────────
  function renderSettings() {
    const settings = Store.getSettings();
    const me = Store.getCurrentUser();
    const meInfo = settings.users.find(u => u.id === me);

    return `
      <div class="settings-group">
        <div class="settings-group-title">我的帳號</div>
        <div class="settings-item" onclick="Pages.editUser('${esc(me)}')">
          <div class="settings-item-left">
            <div class="settings-item-icon">${esc(meInfo.emoji)}</div>
            <div class="settings-item-label">${esc(meInfo.name)}</div>
          </div>
          <div class="settings-item-arrow">›</div>
        </div>
        <div class="settings-item" onclick="Pages.editPin()">
          <div class="settings-item-left">
            <div class="settings-item-icon">🔒</div>
            <div class="settings-item-label">${meInfo.pin ? '變更 PIN 碼' : '設定 PIN 碼'}</div>
          </div>
          <div class="settings-item-value">${meInfo.pin ? '已設定' : '未設定'}</div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">分類管理</div>
        <div class="settings-item" onclick="Pages.showManageCategories('expense')">
          <div class="settings-item-left">
            <div class="settings-item-icon">🏷️</div>
            <div class="settings-item-label">支出分類</div>
          </div>
          <div class="settings-item-value">${Store.getExpenseCategories().length} 個</div>
        </div>
        <div class="settings-item" onclick="Pages.showManageCategories('income')">
          <div class="settings-item-left">
            <div class="settings-item-icon">💵</div>
            <div class="settings-item-label">收入分類</div>
          </div>
          <div class="settings-item-value">${Store.getIncomeCategories().length} 個</div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">股票設定</div>
        <div class="settings-item" onclick="Pages.editFinnhubKey()">
          <div class="settings-item-left">
            <div class="settings-item-icon">📈</div>
            <div class="settings-item-label">Finnhub API Key（美股）</div>
          </div>
          <div class="settings-item-value">${Store.getFinnhubKey() ? '已設定' : '未設定'}</div>
        </div>
        <div class="settings-item" onclick="Pages.editUsdToTwdRate()">
          <div class="settings-item-left">
            <div class="settings-item-icon">💱</div>
            <div class="settings-item-label">美金換台幣匯率</div>
          </div>
          <div class="settings-item-value">1 USD = ${Utils.getUsdToTwdRate()}</div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">資料管理</div>
        <div class="settings-item" onclick="Pages.exportData()">
          <div class="settings-item-left">
            <div class="settings-item-icon">📤</div>
            <div class="settings-item-label">匯出資料</div>
          </div>
          <div class="settings-item-arrow">›</div>
        </div>
        <div class="settings-item" onclick="Pages.importData()">
          <div class="settings-item-left">
            <div class="settings-item-icon">📥</div>
            <div class="settings-item-label">匯入資料</div>
          </div>
          <div class="settings-item-arrow">›</div>
        </div>
        <div class="settings-item" onclick="Pages.showNotionImport()">
          <div class="settings-item-left">
            <div class="settings-item-icon">📋</div>
            <div class="settings-item-label">從 Notion 匯入</div>
          </div>
          <div class="settings-item-value">CSV</div>
        </div>
        <div class="settings-item" onclick="Pages.clearData()">
          <div class="settings-item-left">
            <div class="settings-item-icon">🔄</div>
            <div class="settings-item-label" style="color:var(--danger)">重置本機資料（雲端不受影響）</div>
          </div>
          <div class="settings-item-arrow">›</div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">關於</div>
        <div class="settings-item">
          <div class="settings-item-left">
            <div class="settings-item-icon">💜</div>
            <div class="settings-item-label">Pinchi 記帳</div>
          </div>
          <div class="settings-item-value">v1.1</div>
        </div>
      </div>
    `;
  }

  // ──────────── Modals ────────────
  function showModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.getElementById('modal-content').scrollTop = 0;
  }

  function hideModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  function showTxDetail(txId) {
    const tx = Store.getVisibleTransactions().find(t => t.id === txId);
    if (!tx) return;
    const me = Store.getCurrentUser();
    const cat = Utils.getCategoryInfo(tx.category, tx.type);
    const user = Utils.getUserInfo(tx.userId);
    const card = tx.creditCardId ? Store.getCreditCards().find(c => c.id === tx.creditCardId) : null;
    const canEdit = tx.userId === me || tx.walletType === 'shared' || tx.walletType === 'house_fund';

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${esc(cat.icon)} ${esc(tx.description || cat.name)}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="detail-row">
        <div class="detail-label">金額</div>
        <div class="detail-value" style="color:${tx.type === 'income' ? 'var(--income-color)' : 'var(--expense-color)'}">
          ${tx.type === 'income' ? '+' : '-'}${Utils.formatAmount(tx.amount)}
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">類型</div>
        <div class="detail-value">${tx.type === 'income' ? '收入' : '支出'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">分類</div>
        <div class="detail-value">${esc(cat.icon)} ${esc(cat.name)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">日期</div>
        <div class="detail-value">${Utils.formatFullDate(tx.date)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">記錄者</div>
        <div class="detail-value">${esc(user.emoji)} ${esc(user.name)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">錢包</div>
        <div class="detail-value">${tx.walletType === 'house_fund' ? '🏠 買房基金' : tx.walletType === 'shared' ? '💑 共用錢包' : '👤 個人'}</div>
      </div>
      ${card ? `
        <div class="detail-row">
          <div class="detail-label">信用卡</div>
          <div class="detail-value">${esc(card.name)}</div>
        </div>
      ` : ''}
      ${tx.note ? `
        <div class="detail-row">
          <div class="detail-label">備註</div>
          <div class="detail-value">${esc(tx.note)}</div>
        </div>
      ` : ''}
      ${canEdit ? `
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="Pages.editTx('${tx.id}')">編輯</button>
          <button class="btn btn-danger" onclick="Pages.deleteTx('${tx.id}')">刪除</button>
        </div>
      ` : ''}
    `);
  }

  function showAddCard(editCard) {
    const me = Store.getCurrentUser();
    const myAccounts = Store.getMyAccounts();
    const isEdit = !!editCard;

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${isEdit ? '編輯信用卡' : '新增信用卡'}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>卡片名稱</label>
          <input type="text" id="card-name" placeholder="例：中信 LINE Pay" value="${esc(editCard?.name || '')}">
        </div>
        <div class="form-field">
          <label>卡號末四碼</label>
          <input type="text" id="card-digits" placeholder="1234" maxlength="4" value="${esc(editCard?.lastFourDigits || '')}">
        </div>
        <div class="form-field">
          <label>結帳日（每月幾號）</label>
          <input type="number" id="card-stmt" min="1" max="28" placeholder="例：15" value="${editCard?.statementDay || ''}">
        </div>
        <div class="form-field">
          <label>扣款日（每月幾號）</label>
          <input type="number" id="card-pay" min="1" max="28" placeholder="例：3" value="${editCard?.paymentDay || ''}">
        </div>
        <div class="form-field">
          <label>扣款帳戶</label>
          <select id="card-account">
            <option value="">不綁定帳戶</option>
            ${myAccounts.map(a => `
              <option value="${a.id}" ${editCard?.linkedAccountId === a.id ? 'selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>
            `).join('')}
          </select>
          <div class="field-hint">綁定後，扣款日會自動從該帳戶扣除當月信用卡帳單</div>
        </div>
        <div class="form-field">
          <label>卡片顏色</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${Utils.CARD_COLORS.map((c, i) => `
              <div onclick="document.querySelectorAll('.color-opt').forEach(e=>e.style.outline='');this.style.outline='3px solid var(--primary)';document.getElementById('card-color-val').value='${c}'"
                class="color-opt" style="width:36px;height:36px;border-radius:8px;background:${c};cursor:pointer;
                ${editCard?.color === c ? 'outline:3px solid var(--primary)' : ''}"></div>
            `).join('')}
          </div>
          <input type="hidden" id="card-color-val" value="${editCard?.color || Utils.CARD_COLORS[0]}">
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button class="btn btn-danger" onclick="Pages.deleteCard('${editCard.id}')">刪除</button>` : ''}
        <button class="btn btn-primary" onclick="Pages.saveCard('${editCard?.id || ''}')">${isEdit ? '更新' : '新增'}</button>
      </div>
    `);
  }

  function showCardDetail(cardId) {
    const card = Store.getCreditCards().find(c => c.id === cardId);
    if (!card) return;
    showAddCard(card);
  }

  // ──────────── Actions ────────────
  function selectCategory(btn) {
    const catId = btn.dataset.cat;
    if (catId === 'other' || catId === 'other_income') {
      showAddCustomCategory();
      return;
    }
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function showAddCustomCategory() {
    const type = addTxType;
    const commonIcons = ['🛒','🏠','🚗','💊','📱','🐱','🎁','✈️','📚','🛍️','🎬','☕','💇','🏋️','🎵','🔧','👶','💐'];
    showModal(`
      <div class="modal-header">
        <div class="modal-title">新增自訂分類</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>圖示</label>
          <div class="icon-picker" id="icon-picker">
            ${commonIcons.map(ic => `
              <button type="button" class="icon-pick-btn" onclick="Pages.pickCatIcon(this)" data-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
          <input type="text" id="custom-cat-icon" value="📌" style="font-size:24px;text-align:center;margin-top:8px" maxlength="2">
        </div>
        <div class="form-field">
          <label>分類名稱</label>
          <input type="text" id="custom-cat-name" placeholder="例：咖啡、寵物..." autofocus>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.saveCustomCategory('${type}')">新增並選擇</button>
      </div>
    `);
  }

  function pickCatIcon(btn) {
    document.querySelectorAll('.icon-pick-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('custom-cat-icon').value = btn.dataset.icon;
  }

  function saveCustomCategory(type) {
    const icon = document.getElementById('custom-cat-icon').value.trim();
    const name = document.getElementById('custom-cat-name').value.trim();
    if (!name) { Utils.showToast('請輸入分類名稱'); return; }
    if (!icon) { Utils.showToast('請選擇或輸入圖示'); return; }

    const id = 'custom_' + Date.now().toString(36);
    Store.addCategory(type, { id, icon, name });
    hideModal();
    App.navigate('add');

    setTimeout(() => {
      const btn = document.querySelector(`.category-btn[data-cat="${id}"]`);
      if (btn) {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    }, 50);
  }

  // ──────────── Category Management ────────────
  function showManageCategories(type) {
    const cats = type === 'income' ? Store.getIncomeCategories() : Store.getExpenseCategories();
    const typeName = type === 'income' ? '收入' : '支出';

    showModal(`
      <div class="modal-header">
        <div class="modal-title">管理${typeName}分類</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="cat-manage-list">
        ${cats.map(c => `
          <div class="cat-manage-item">
            <span class="cat-manage-icon">${esc(c.icon)}</span>
            <span class="cat-manage-name">${esc(c.name)}</span>
            <div class="cat-manage-actions">
              <button class="cat-manage-btn" onclick="Pages.showEditCategory('${type}','${esc(c.id)}')">✏️</button>
              ${(c.id !== 'other' && c.id !== 'other_income')
                ? `<button class="cat-manage-btn danger" onclick="Pages.confirmDeleteCategory('${type}','${esc(c.id)}')">🗑️</button>`
                : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="modal-actions" style="margin-top:12px">
        <button class="btn btn-primary" onclick="Pages.showAddCategoryFromManage('${type}')">＋ 新增分類</button>
      </div>
    `);
  }

  function showAddCategoryFromManage(type) {
    const commonIcons = ['🛒','🏠','🚗','💊','📱','🐱','🎁','✈️','📚','🛍️','🎬','☕','💇','🏋️','🎵','🔧','👶','💐'];
    showModal(`
      <div class="modal-header">
        <div class="modal-title">新增分類</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>圖示</label>
          <div class="icon-picker" id="icon-picker">
            ${commonIcons.map(ic => `
              <button type="button" class="icon-pick-btn" onclick="Pages.pickCatIcon(this)" data-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
          <input type="text" id="custom-cat-icon" value="📌" style="font-size:24px;text-align:center;margin-top:8px" maxlength="2">
        </div>
        <div class="form-field">
          <label>分類名稱</label>
          <input type="text" id="custom-cat-name" placeholder="例：咖啡、寵物..." autofocus>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.saveNewCategoryFromManage('${type}')">新增</button>
      </div>
    `);
  }

  function saveNewCategoryFromManage(type) {
    const icon = document.getElementById('custom-cat-icon').value.trim();
    const name = document.getElementById('custom-cat-name').value.trim();
    if (!name) { Utils.showToast('請輸入分類名稱'); return; }
    if (!icon) { Utils.showToast('請選擇或輸入圖示'); return; }
    const id = 'custom_' + Date.now().toString(36);
    Store.addCategory(type, { id, icon, name });
    Utils.showToast('已新增');
    showManageCategories(type);
  }

  function showEditCategory(type, catId) {
    const cats = type === 'income' ? Store.getIncomeCategories() : Store.getExpenseCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    const commonIcons = ['🛒','🏠','🚗','💊','📱','🐱','🎁','✈️','📚','🛍️','🎬','☕','💇','🏋️','🎵','🔧','👶','💐'];

    showModal(`
      <div class="modal-header">
        <div class="modal-title">編輯分類</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>圖示</label>
          <div class="icon-picker" id="icon-picker">
            ${commonIcons.map(ic => `
              <button type="button" class="icon-pick-btn ${cat.icon === ic ? 'active' : ''}" onclick="Pages.pickCatIcon(this)" data-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
          <input type="text" id="custom-cat-icon" value="${esc(cat.icon)}" style="font-size:24px;text-align:center;margin-top:8px" maxlength="2">
        </div>
        <div class="form-field">
          <label>分類名稱</label>
          <input type="text" id="custom-cat-name" value="${esc(cat.name)}">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.saveEditCategory('${type}','${catId}')">儲存</button>
      </div>
    `);
  }

  function saveEditCategory(type, catId) {
    const icon = document.getElementById('custom-cat-icon').value.trim();
    const name = document.getElementById('custom-cat-name').value.trim();
    if (!name) { Utils.showToast('請輸入分類名稱'); return; }
    if (!icon) { Utils.showToast('請選擇或輸入圖示'); return; }
    Store.updateCategory(type, catId, { icon, name });
    Utils.showToast('已更新');
    showManageCategories(type);
  }

  function confirmDeleteCategory(type, catId) {
    // 名稱從資料查，不經 onclick 字串傳遞，避免特殊字元造成 JS 注入
    const cats = type === 'income' ? Store.getIncomeCategories() : Store.getExpenseCategories();
    const cat = cats.find(c => c.id === catId);
    const catName = cat ? cat.name : '';
    if (confirm(`確定要刪除「${catName}」分類嗎？已記錄的交易不受影響。`)) {
      Store.deleteCategory(type, catId);
      Utils.showToast('已刪除');
      showManageCategories(type);
    }
  }

  function saveTx(editId, type) {
    const amount = parseFloat(document.getElementById('tx-amount').value);
    if (!amount || amount <= 0) { Utils.showToast('請輸入金額'); return; }

    const activeCategory = document.querySelector('.category-btn.active');
    if (!activeCategory) { Utils.showToast('請選擇分類'); return; }

    const me = Store.getCurrentUser();
    let walletType = document.getElementById('tx-wallet').value;
    const accountId = document.getElementById('tx-account')?.value || '';
    const old = editId ? Store.getTransactions().find(t => t.id === editId) : null;

    // 買房基金交易在表單上顯示為「共同帳本」；編輯時若沒切到私人帳本，保留原本的 house_fund 歸屬
    if (old && old.walletType === 'house_fund' && walletType === 'shared') {
      walletType = 'house_fund';
    }

    // 帳戶連結：收入＋私人帳本時取表單值；編輯時若類型/帳本沒變，保留原本的連結
    // （例如編輯一筆「手動扣款」交易的說明，不應讓帳戶餘額被退回）
    let txAccountId = '';
    if (type === 'income' && walletType === 'personal') {
      txAccountId = accountId;
    } else if (old && old.accountId && old.type === type && old.walletType === walletType) {
      txAccountId = old.accountId;
    }

    const tx = {
      amount,
      type,
      category: activeCategory.dataset.cat,
      description: document.getElementById('tx-desc').value.trim(),
      note: document.getElementById('tx-note').value.trim(),
      date: document.getElementById('tx-date').value || Utils.todayStr(),
      userId: walletType === 'personal' ? me : (document.getElementById('tx-user').value === 'shared_wallet' ? 'shared_wallet' : document.getElementById('tx-user').value),
      walletType,
      creditCardId: type === 'expense' && document.getElementById('tx-user')?.value !== 'shared_wallet' ? (document.getElementById('tx-card')?.value || '') : '',
      accountId: txAccountId,
    };

    if (editId) {
      Store.updateTransaction(editId, tx);
      Utils.showToast('已更新紀錄');
      editingTx = null;
      App.refresh();
      return;
    }

    // 帳戶餘額由 Store.addTransaction 依 accountId 自動調整
    Store.addTransaction(tx);

    if (type === 'income' && walletType === 'personal' && accountId) {
      const account = Store.getAccounts().find(a => a.id === accountId);
      Utils.showToast(`已記錄！${account ? account.name : '帳戶'}餘額已更新`);
    } else if (tx.walletType === 'shared' && tx.creditCardId) {
      const card = Store.getCreditCards().find(c => c.id === tx.creditCardId);
      if (card) {
        Utils.showToast(`已記錄！同時計入 ${card.name} 帳單`);
      } else {
        Utils.showToast('已新增紀錄！');
      }
    } else {
      Utils.showToast('已新增紀錄！');
    }

    editingTx = null;
    App.navigate('dashboard');
  }

  function saveCard(editId) {
    const me = Store.getCurrentUser();
    const name = document.getElementById('card-name').value.trim();
    if (!name) { Utils.showToast('請輸入卡片名稱'); return; }

    const stmt = parseInt(document.getElementById('card-stmt').value);
    const pay = parseInt(document.getElementById('card-pay').value);
    if (!stmt || !pay || stmt < 1 || stmt > 28 || pay < 1 || pay > 28) {
      Utils.showToast('結帳日和扣款日請填 1~28'); return;
    }

    const card = {
      name,
      lastFourDigits: document.getElementById('card-digits').value.trim(),
      ownerId: me,
      statementDay: stmt,
      paymentDay: pay,
      linkedAccountId: document.getElementById('card-account').value || '',
      color: document.getElementById('card-color-val').value,
    };

    if (editId) {
      Store.updateCreditCard(editId, card);
      Utils.showToast('已更新卡片');
    } else {
      Store.addCreditCard(card);
      Utils.showToast('已新增卡片！');
    }

    hideModal();
    cardViewId = null;
    App.navigate('creditCards');
  }

  function deleteTx(id) {
    if (confirm('確定要刪除這筆紀錄嗎？')) {
      Store.deleteTransaction(id);
      hideModal();
      Utils.showToast('已刪除');
      App.refresh();
    }
  }

  function deleteCard(id) {
    if (confirm('確定要刪除這張卡片嗎？相關交易不會被刪除。')) {
      Store.deleteCreditCard(id);
      hideModal();
      cardViewId = null;
      Utils.showToast('已刪除卡片');
      App.navigate('creditCards');
    }
  }

  function editTx(id) {
    hideModal();
    editingTx = Store.getTransactions().find(t => t.id === id);
    if (editingTx) {
      addTxType = editingTx.type;
      App.navigate('add');
    }
  }

  function editUser(userId) {
    const settings = Store.getSettings();
    const user = settings.users.find(u => u.id === userId);
    if (!user) return;

    showModal(`
      <div class="modal-header">
        <div class="modal-title">編輯我的資料</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>名稱</label>
          <input type="text" id="edit-user-name" value="${esc(user.name)}">
        </div>
        <div class="form-field">
          <label>表情符號</label>
          <input type="text" id="edit-user-emoji" value="${esc(user.emoji)}" style="font-size:24px;text-align:center;">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.saveUser('${userId}')">儲存</button>
      </div>
    `);
  }

  function saveUser(userId) {
    const settings = Store.getSettings();
    const user = settings.users.find(u => u.id === userId);
    if (!user) return;
    user.name = document.getElementById('edit-user-name').value.trim() || user.name;
    user.emoji = document.getElementById('edit-user-emoji').value.trim() || user.emoji;
    Store.saveSettings(settings);
    hideModal();
    Utils.showToast('已更新');
    App.navigate('settings');
  }

  function editPin() {
    const me = Store.getCurrentUser();
    const settings = Store.getSettings();
    const user = settings.users.find(u => u.id === me);

    showModal(`
      <div class="modal-header">
        <div class="modal-title">🔒 ${user.pin ? '變更' : '設定'} PIN 碼</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
        PIN 碼用來保護你的個人隱私紀錄，防止另一半看到你的私人收支。
      </p>
      ${user.pin ? `
        <div class="form-grid">
          <div class="form-field">
            <label>目前 PIN 碼</label>
            <input type="password" id="old-pin" inputmode="numeric" maxlength="6"
              class="pin-input">
          </div>
          <div class="form-field">
            <label>新 PIN 碼（留空則移除）</label>
            <input type="password" id="new-pin" inputmode="numeric" maxlength="6"
              class="pin-input">
          </div>
        </div>
      ` : `
        <div class="form-grid">
          <div class="form-field">
            <label>設定 PIN 碼（4~6 碼數字）</label>
            <input type="password" id="new-pin" inputmode="numeric" maxlength="6"
              class="pin-input" autofocus>
          </div>
        </div>
      `}
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.savePin()">儲存</button>
      </div>
    `);
  }

  function savePin() {
    const me = Store.getCurrentUser();
    const settings = Store.getSettings();
    const user = settings.users.find(u => u.id === me);

    if (user.pin) {
      const oldPin = document.getElementById('old-pin').value;
      if (oldPin !== user.pin) { Utils.showToast('目前 PIN 碼不正確'); return; }
    }

    const newPin = document.getElementById('new-pin').value.trim();
    if (newPin && (newPin.length < 4 || !/^\d+$/.test(newPin))) {
      Utils.showToast('PIN 碼需為 4~6 碼數字'); return;
    }

    user.pin = newPin;
    Store.saveSettings(settings);
    hideModal();
    Utils.showToast(newPin ? 'PIN 碼已設定' : 'PIN 碼已移除');
    App.navigate('settings');
  }

  function editFinnhubKey() {
    const currentKey = Store.getFinnhubKey();
    showModal(`
      <div class="modal-header">
        <div class="modal-title">📈 Finnhub API Key</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
        用於自動抓取<strong>美股</strong>即時報價（台股不需要此 Key）。<br>
        免費申請：<a href="https://finnhub.io" target="_blank" style="color:var(--primary)">finnhub.io</a> 註冊後即可取得。
      </p>
      <div class="form-grid">
        <div class="form-field">
          <label>API Key</label>
          <input type="text" id="finnhub-key" placeholder="輸入你的 Finnhub API Key" value="${esc(currentKey)}">
        </div>
      </div>
      <div class="modal-actions">
        ${currentKey ? `<button class="btn btn-ghost" onclick="Store.setFinnhubKey('');Pages.hideModal();Utils.showToast('已移除');App.navigate('settings')">移除</button>` : ''}
        <button class="btn btn-primary" onclick="Pages.saveFinnhubKey()">儲存</button>
      </div>
    `);
  }

  function saveFinnhubKey() {
    const key = document.getElementById('finnhub-key').value.trim();
    Store.setFinnhubKey(key);
    hideModal();
    Utils.showToast(key ? 'API Key 已儲存' : 'API Key 已移除');
    App.navigate('settings');
  }

  function editUsdToTwdRate() {
    const rate = Utils.getUsdToTwdRate();
    showModal(`
      <div class="modal-header">
        <div class="modal-title">💱 美金換台幣匯率</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
        僅供參考換算（總資產已分台幣、美金獨立計算，不會合併加總）。
      </p>
      <div class="form-grid">
        <div class="form-field">
          <label>1 美金 = ? 台幣</label>
          <input type="number" id="usd-twd-rate" placeholder="32" inputmode="decimal" step="0.01"
            value="${rate}" style="font-size:18px;text-align:center;font-weight:700">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Pages.saveUsdToTwdRate()">儲存</button>
      </div>
    `);
    setTimeout(() => document.getElementById('usd-twd-rate')?.focus(), 300);
  }

  function saveUsdToTwdRate() {
    const rate = parseFloat(document.getElementById('usd-twd-rate').value);
    if (!rate || rate <= 0) { Utils.showToast('請輸入有效匯率'); return; }
    const settings = Store.getSettings();
    settings.usdToTwdRate = rate;
    Store.saveSettings(settings);
    hideModal();
    Utils.showToast(`匯率已更新：1 USD = ${rate} TWD`);
    App.navigate('settings');
  }

  function exportData() {
    const data = Store.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pinchi-backup-${Utils.todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.showToast('已匯出資料');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        let data;
        try { data = JSON.parse(ev.target.result); } catch { Utils.showToast('匯入失敗，檔案格式不正確'); return; }

        // 匯入會整表取代雲端與本機資料，先讓使用者確認備份內容
        const count = (arr) => Array.isArray(arr) ? arr.length : 0;
        const summary = [
          data.transactions !== undefined ? `交易 ${count(data.transactions)} 筆` : '',
          data.accounts !== undefined ? `帳戶 ${count(data.accounts)} 個` : '',
          data.creditCards !== undefined ? `信用卡 ${count(data.creditCards)} 張` : '',
          data.settings !== undefined ? '設定' : '',
        ].filter(Boolean).join('、');
        if (!confirm(`匯入將以備份內容【完全取代】現有資料：\n${summary || '（檔案中沒有可辨識的資料）'}\n\n確定要繼續嗎？`)) return;

        Utils.showToast('匯入中...');
        const ok = await Store.importData(ev.target.result);
        if (ok) {
          Utils.showToast('匯入成功！');
          App.navigate('dashboard');
        } else {
          Utils.showToast('匯入失敗，資料未變更或不完整，請檢查檔案');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ──────────── Notion CSV Import ────────────
  function showNotionImport() {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">從 Notion 匯入</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
        在 Notion 的資料庫右上角選單 → 匯出 → CSV 格式，然後在這裡選擇匯入。
      </p>
      <div class="notion-import-options">
        <button class="notion-import-btn" onclick="Pages.pickNotionCsv('expense')">
          <span class="nib-icon">📤</span>
          <span class="nib-title">FOCUS支出</span>
          <span class="nib-desc">個人支出資料庫</span>
        </button>
        <button class="notion-import-btn" onclick="Pages.pickNotionCsv('income')">
          <span class="nib-icon">📥</span>
          <span class="nib-title">FOCUS收入</span>
          <span class="nib-desc">個人收入資料庫</span>
        </button>
        <button class="notion-import-btn" onclick="Pages.pickNotionCsv('shared')">
          <span class="nib-icon">💑</span>
          <span class="nib-title">共用錢包 支出紀錄</span>
          <span class="nib-desc">共同帳本資料庫</span>
        </button>
      </div>
    `);
  }

  function pickNotionCsv(importType) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = processNotionCsv(ev.target.result, importType);
        if (result.error) {
          Utils.showToast(result.error);
        } else {
          showNotionImportPreview(result.transactions, importType);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        lines.push(current);
        current = '';
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (current || lines.length > 0) {
          lines.push(current);
          current = '';
        }
        if (lines.length > 0) return { row: lines, rest: text.slice(i + (text[i + 1] === '\n' ? 2 : 1)) };
      } else {
        current += ch;
      }
    }
    if (current || lines.length > 0) {
      lines.push(current);
    }
    return { row: lines.length > 0 ? lines : null, rest: '' };
  }

  function parseFullCSV(text) {
    const rows = [];
    let remaining = text.trim();
    while (remaining) {
      const { row, rest } = parseCSV(remaining);
      if (!row) break;
      rows.push(row.map(c => c.trim()));
      remaining = rest;
    }
    return rows;
  }

  function processNotionCsv(csvText, importType) {
    const rows = parseFullCSV(csvText);
    if (rows.length < 2) return { error: 'CSV 檔案是空的' };

    const headers = rows[0];
    const me = Store.getCurrentUser();
    const settings = Store.getSettings();

    const notionCatMap = {
      '飲食': 'food',
      '交通': 'transport',
      '訂閱': 'other',
      '孝親費': 'other',
      '社交/娛樂': 'entertainment',
      '保險': 'other',
      '投資': 'other',
      '醫療': 'other',
      '購物': 'other',
      '固定支出': 'living',
      '繳費': 'living',
      '生活用品': 'living',
      '娛樂': 'entertainment',
      '交際': 'entertainment',
    };

    const incomeCatMap = {
      '副業/商業': 'side',
      '家教/學習': 'side',
      '理財': 'investment',
      '工作/正職': 'salary',
    };

    const col = (row, name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? row[idx] : '';
    };

    const parseAmount = (raw) => {
      if (!raw) return 0;
      return parseFloat(raw.replace(/[$,\s]/g, '')) || 0;
    };

    const transactions = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;

      let tx = null;

      if (importType === 'expense') {
        const name = col(row, '項目');
        if (name.startsWith('💳')) continue;
        const amount = parseAmount(col(row, '花費'));
        const dateRaw = col(row, '消費日期');
        const category = col(row, '類型');
        const reason = col(row, '花費理由');
        if (!amount || amount <= 0) continue;
        const date = parseDateStr(dateRaw);
        if (!date) continue;
        if (category === '繳費') continue;
        tx = {
          amount,
          type: 'expense',
          category: notionCatMap[category] || 'other',
          description: reason || name || '',
          date,
          userId: me,
          walletType: 'personal',
          creditCardId: '',
        };
      } else if (importType === 'income') {
        const name = col(row, '項目');
        const amount = parseAmount(col(row, '收入'));
        const dateRaw = col(row, '日期');
        const category = col(row, '種類');
        if (!amount || amount <= 0) continue;
        const date = parseDateStr(dateRaw);
        if (!date) continue;
        tx = {
          amount,
          type: 'income',
          category: incomeCatMap[category] || 'other_income',
          description: name || '',
          date,
          userId: me,
          walletType: 'personal',
          creditCardId: '',
        };
      } else if (importType === 'shared') {
        const name = col(row, '項目');
        const amount = parseAmount(col(row, '金額'));
        const dateRaw = col(row, '日期');
        const category = col(row, '類型');
        const payer = col(row, '誰付錢');
        const txType = col(row, '支出/收入');
        if (!amount || amount <= 0) continue;
        const date = parseDateStr(dateRaw);
        if (!date) continue;

        let userId = me;
        if (payer) {
          const matched = settings.users.find(u => u.name === payer);
          if (matched) userId = matched.id;
        }

        tx = {
          amount,
          type: txType === '收入' ? 'income' : 'expense',
          category: notionCatMap[category] || 'other',
          description: name || '',
          date,
          userId,
          walletType: 'shared',
          creditCardId: '',
        };
      }

      if (tx) transactions.push(tx);
    }

    if (transactions.length === 0) return { error: '沒有找到可匯入的資料，請確認 CSV 欄位是否正確' };
    return { transactions };
  }

  function parseDateStr(raw) {
    if (!raw) return null;
    const cleaned = raw
      .replace(/\s*\(GMT[^)]*\)/g, '')
      .replace(/[年月]/g, '-').replace(/日/g, '')
      .replace(/\//g, '-')
      .trim();
    const parts = cleaned.split(/[-T\s:]/);
    if (parts.length < 3) return null;
    const y = parts[0].length === 4 ? parts[0] : '20' + parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    const result = `${y}-${m}-${d}`;
    if (isNaN(new Date(result).getTime())) return null;
    return result;
  }

  function showNotionImportPreview(txs, importType) {
    const typeName = importType === 'expense' ? '個人支出'
      : importType === 'income' ? '個人收入' : '共用錢包';
    const expenseCount = txs.filter(t => t.type === 'expense').length;
    const incomeCount = txs.filter(t => t.type === 'income').length;
    const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

    const preview = txs.slice(0, 5);

    showModal(`
      <div class="modal-header">
        <div class="modal-title">匯入預覽</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">${typeName}</div>
        <div style="font-size:13px;color:var(--text-secondary)">
          共 ${txs.length} 筆紀錄
          ${expenseCount > 0 ? `<br>支出 ${expenseCount} 筆，合計 ${Utils.formatAmount(totalExpense)}` : ''}
          ${incomeCount > 0 ? `<br>收入 ${incomeCount} 筆，合計 ${Utils.formatAmount(totalIncome)}` : ''}
        </div>
      </div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">前 ${preview.length} 筆預覽：</div>
      <div class="notion-preview-list">
        ${preview.map(tx => {
          const cat = Utils.getCategoryInfo(tx.category, tx.type);
          return `
            <div class="notion-preview-item">
              <span>${esc(cat.icon)}</span>
              <span style="flex:1">${esc(tx.description || cat.name)}</span>
              <span style="font-weight:700;color:var(--${tx.type === 'expense' ? 'expense' : 'income'}-color)">
                ${tx.type === 'expense' ? '-' : '+'}${Utils.formatAmount(tx.amount)}
              </span>
              <span style="font-size:11px;color:var(--text-muted)">${tx.date}</span>
            </div>`;
        }).join('')}
        ${txs.length > 5 ? `<div style="text-align:center;padding:8px;color:var(--text-muted);font-size:12px">⋯ 還有 ${txs.length - 5} 筆</div>` : ''}
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn" onclick="Pages.showNotionImport()">返回</button>
        <button class="btn btn-primary" onclick="Pages.confirmNotionImport()">確認匯入 ${txs.length} 筆</button>
      </div>
    `);

    window._pendingNotionImport = txs;
  }

  function confirmNotionImport() {
    const txs = window._pendingNotionImport;
    if (!txs || txs.length === 0) return;
    const count = Store.bulkAddTransactions(txs);
    window._pendingNotionImport = null;
    hideModal();
    Utils.showToast(`成功匯入 ${count} 筆紀錄！`);
    App.navigate('dashboard');
  }

  function clearData() {
    if (confirm('要重置本機資料嗎？\n雲端資料不受影響，重新登入後會自動同步回來。')) {
      // 保留裝置驗證，重置後不必重新輸入通行密碼
      Object.keys(localStorage)
        .filter(k => k.startsWith('pinchi_') && k !== 'pinchi_device_bound')
        .forEach(k => localStorage.removeItem(k));
      Utils.showToast('已重置本機資料');
      App.logout();
    }
  }

  function switchTxType(type) {
    addTxType = type;
    if (editingTx) editingTx.type = type;
    App.navigate('add');
  }

  function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    App.refresh();
  }

  function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    App.refresh();
  }

  function setWalletFilter(f) {
    walletFilter = f === 'house_fund' ? 'shared' : f;
    App.refresh();
  }

  function resetFilters() {
    walletFilter = 'shared';
    assetView = localStorage.getItem(ASSET_VIEW_KEY) || 'house_fund';
    cardViewId = null;
    editingTx = null;
    addTxType = 'expense';
    txViewMode = 'list';
    calendarSelectedDate = null;
    dashboardTab = 'shared';
  }

  return {
    renderLogin,
    tryLogin,
    confirmLogin,
    renderDashboard,
    renderTransactions,
    renderAddTransaction: () => renderAddTransaction(editingTx),
    renderCards,
    renderWallet,
    renderAccounts,
    showAddAccount: () => showAddAccount(),
    showEditAccount,
    showAccountDetail,
    saveAccount,
    deleteAccount,
    showAdjustBalance,
    confirmAdjust,
    renderSettings,
    showTxDetail,
    showCardDetail,
    showAddCard: () => showAddCard(),
    hideModal,
    selectCategory,
    pickCatIcon,
    saveCustomCategory,
    showManageCategories,
    showAddCategoryFromManage,
    saveNewCategoryFromManage,
    showEditCategory,
    saveEditCategory,
    confirmDeleteCategory,
    setAddWallet,
    onPayerChange,
    saveTx,
    saveCard,
    deleteTx,
    deleteCard,
    editTx,
    editUser,
    saveUser,
    editPin,
    savePin,
    editFinnhubKey,
    saveFinnhubKey,
    editUsdToTwdRate,
    saveUsdToTwdRate,
    exportData,
    importData,
    showNotionImport,
    pickNotionCsv,
    confirmNotionImport,
    clearData,
    switchTxType,
    prevMonth,
    nextMonth,
    showAddStock: (s) => showAddStock(s),
    saveStock,
    deleteStock,
    showStockDetail,
    showBuySellStock,
    saveStockTx,
    refreshAllStockPrices,
    fetchAndRefresh,
    switchMarket,
    togglePanel,
    renderCreditCards,
    setWalletFilter,
    setAssetView,
    openHouseFundAssets,
    showEditHouseFundDeposit,
    confirmHouseFundDeposit,
    setDashboardTab,
    setViewMode,
    selectCalendarDate,
    resetFilters,
    viewCardStatement,
    closeCardStatement,
    get addTxType() { return addTxType; },
    get editingTx() { return editingTx; },
    resetEditingTx() { editingTx = null; },
  };
})();
