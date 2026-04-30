const Pages = (() => {
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let walletFilter = 'shared'; // 'shared' | 'house_fund' | 'personal'
  let cardViewId = null;
  let txViewMode = 'list';   // 'list' | 'calendar' | 'chart'
  let calendarSelectedDate = null;
  let dashboardTab = 'personal'; // 'personal' | 'shared'

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
            <button class="login-user-btn" onclick="Pages.tryLogin('${u.id}')">
              <span class="login-user-emoji">${u.emoji}</span>
              <span class="login-user-name">${u.name}</span>
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
          <div class="modal-title">${user.emoji} 輸入 PIN</div>
          <button class="modal-close" onclick="Pages.hideModal()">✕</button>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <input type="password" id="login-pin" placeholder="輸入 PIN 碼" inputmode="numeric"
              maxlength="6" style="text-align:center;font-size:24px;letter-spacing:8px;" autofocus>
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

    const personalTxs = allTxs.filter(tx => tx.walletType === 'personal' && tx.userId === me);
    const personalBalance = personalTxs.reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
    const personalToday = personalTxs.filter(tx => tx.date === todayStr)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const sharedTxs = allTxs.filter(tx => tx.walletType === 'shared');
    const sharedBalance = sharedTxs.reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
    const sharedRecent = sharedTxs
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);

    const houseFundTxs = allTxs.filter(tx => tx.walletType === 'house_fund');
    const houseFundBalance = houseFundTxs.reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);

    const renderTxList = (txs, emptyMsg) => {
      if (txs.length === 0) return `<div class="dash-empty">${emptyMsg}</div>`;
      return txs.map(tx => {
        const cat = Utils.getCategoryInfo(tx.category, tx.type);
        const user = Utils.getUserInfo(tx.userId);
        const sign = tx.type === 'income' ? '+' : '-';
        const typeLabel = tx.type === 'income' ? '收入' : '支出';
        return `
          <div class="tx-item" onclick="Pages.showTxDetail('${tx.id}')">
            <div class="tx-icon" style="background:${tx.type === 'income' ? '#E8F5E9' : '#FFEBEE'}">${cat.icon}</div>
            <div class="tx-details">
              <div class="tx-desc">${tx.description || cat.name}</div>
              <div class="tx-meta">
                <span class="tx-meta-text">${user.emoji} ${user.name}・${typeLabel}・${Utils.formatDate(tx.date)}</span>
              </div>
            </div>
            <div class="tx-amount ${tx.type}">${sign}${Utils.formatAmount(tx.amount)}</div>
          </div>`;
      }).join('');
    };

    return `
      <div class="user-greeting">
        <span>${meInfo.emoji} ${meInfo.name}，你好</span>
        <button class="logout-btn" onclick="App.logout()">切換帳號</button>
      </div>

      <button class="quick-add-btn" onclick="App.navigate('add')">
        <span class="quick-add-icon">+</span>
        <span>快速記帳</span>
      </button>

      <div class="card">
        <div class="card-title">我的總資產</div>
        <div class="asset-grid">
          <div class="asset-block" onclick="Pages.setWalletFilter('personal');App.navigate('transactions')">
            <div class="asset-label">🔒 私人</div>
            <div class="asset-value">${Utils.formatAmount(personalBalance)}</div>
          </div>
          <div class="asset-block" onclick="Pages.setWalletFilter('house_fund');App.navigate('transactions')">
            <div class="asset-label">🏠 買房基金</div>
            <div class="asset-value">${Utils.formatAmount(houseFundBalance)}</div>
          </div>
          <div class="asset-block" onclick="Pages.setWalletFilter('shared');App.navigate('transactions')">
            <div class="asset-label">💑 共同</div>
            <div class="asset-value">${Utils.formatAmount(sharedBalance)}</div>
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
                <div class="bill-name">${b.card.name}</div>
                <div class="bill-date">扣款日 ${b.payDate.getMonth() + 1}/${b.payDate.getDate()}（${Utils.daysUntil(b.payDate)} 天後）</div>
              </div>
              <div class="bill-amount">-${Utils.formatAmount(b.unpaid)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="card">
        <div class="dash-tab-bar">
          <button class="dash-tab ${dashboardTab === 'personal' ? 'active' : ''}" onclick="Pages.setDashboardTab('personal')">🔒 私人帳本</button>
          <button class="dash-tab ${dashboardTab === 'shared' ? 'active' : ''}" onclick="Pages.setDashboardTab('shared')">💑 共同帳本</button>
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
      if (walletFilter === 'personal') {
        if (tx.walletType === 'personal' && tx.userId === me) return true;
        if (Store.isAdvancedByMe(tx)) return true;
        return false;
      }
      if (walletFilter === 'house_fund') return tx.walletType === 'house_fund';
      return tx.walletType === 'shared';
    });
  }

  function renderTransactions() {
    const me = Store.getCurrentUser();
    const meInfo = Utils.getUserInfo(me);
    const filtered = getFilteredTxs();
    const groups = Utils.groupByDate(filtered);

    const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;

    let content = '';
    if ((walletFilter === 'shared' || walletFilter === 'house_fund') && txViewMode === 'list') {
      content = renderChatView(filtered);
    } else if (txViewMode === 'calendar') {
      content = renderCalendarView(filtered);
    } else if (txViewMode === 'chart') {
      content = renderChartView(filtered);
    } else {
      content = renderListView(groups);
    }

    const balanceLabel = walletFilter === 'personal' ? '我的結餘' : walletFilter === 'house_fund' ? '買房基金結餘' : '共同結餘';

    return `
      <div class="month-nav">
        <button onclick="Pages.prevMonth()">‹</button>
        <span>${Utils.getMonthLabel(currentYear, currentMonth)}</span>
        <button onclick="Pages.nextMonth()">›</button>
      </div>

      <div class="balance-hero">
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
        <button class="ledger-tab ${walletFilter === 'house_fund' ? 'active' : ''}" onclick="Pages.setWalletFilter('house_fund')">
          <span class="ledger-tab-icon">🏠</span>
          <span class="ledger-tab-name">買房基金</span>
        </button>
        <button class="ledger-tab ${walletFilter === 'personal' ? 'active' : ''}" onclick="Pages.setWalletFilter('personal')">
          <span class="ledger-tab-icon">🔒</span>
          <span class="ledger-tab-name">${meInfo.name}的私帳</span>
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
      if (tx.type !== 'expense') return;
      const day = new Date(tx.date).getDate();
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
    const expenses = txs.filter(t => t.type === 'expense');
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
          ${!isMine ? `<div class="chat-avatar">${user.emoji}</div>` : ''}
          <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
            <div class="chat-bubble-cat">${cat.icon} ${tx.description || cat.name}</div>
            <div class="chat-bubble-amount ${tx.type}">${sign}${Utils.formatAmount(tx.amount)}</div>
            ${card ? `<div class="chat-bubble-card">💳 ${card.name}</div>` : ''}
            <div class="chat-bubble-time">${time}</div>
          </div>
          ${isMine ? `<div class="chat-avatar">${user.emoji}</div>` : ''}
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
        <div class="tx-icon" style="background:${tx.type === 'income' ? '#E8F5E9' : '#FFEBEE'}">${cat.icon}</div>
        <div class="tx-details">
          <div class="tx-desc">${tx.description || cat.name}</div>
          <div class="tx-meta">
            ${isAdvanced ? '<span class="tx-wallet-tag advanced">代墊</span>' : ''}
            <span class="tx-meta-text">${payer.emoji} ${payer.name}・${payMethod}</span>
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
    const defaultWallet = editTx ? editTx.walletType
      : walletFilter === 'house_fund' ? 'house_fund'
      : walletFilter === 'shared' ? 'shared'
      : 'personal';
    const isPersonal = defaultWallet === 'personal';
    const defaultPayer = editTx?.userId || me;
    const payerCards = allCards.filter(c => c.ownerId === (isPersonal ? me : defaultPayer));

    return `
      <div class="type-toggle">
        <button class="${type === 'expense' ? 'active-expense' : ''}" onclick="Pages.switchTxType('expense')">支出</button>
        <button class="${type === 'income' ? 'active-income' : ''}" onclick="Pages.switchTxType('income')">收入</button>
      </div>

      <div class="amount-input-wrap">
        <span class="currency">${settings.currency}</span>
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
            <button type="button" class="wallet-toggle-btn ${defaultWallet === 'house_fund' ? 'active-shared' : ''}"
              onclick="Pages.setAddWallet('house_fund')">
              <span class="wt-icon">🏠</span>
              <span class="wt-label">買房基金</span>
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
          <label>${type === 'income' ? (defaultWallet === 'house_fund' ? '誰存入買房基金' : '誰放入共同錢包') : '由誰支出'}</label>
          <select id="tx-user" onchange="Pages.onPayerChange()">
            ${type === 'expense' ? '<option value="shared_wallet">💩 共用錢包</option>' : ''}
            ${settings.users.map(u => `
              <option value="${u.id}" ${defaultPayer === u.id ? 'selected' : ''}>${u.emoji} ${u.name}</option>
            `).join('')}
          </select>
        </div>

        ${type === 'expense' ? `
          <div class="form-field" id="card-field">
            <label>付款方式</label>
            <select id="tx-card">
              <option value="">💵 現金</option>
              ${payerCards.map(c => `
                <option value="${c.id}" ${editTx?.creditCardId === c.id ? 'selected' : ''}>💳 ${c.name}</option>
              `).join('')}
            </select>
            ${!isPersonal ? '<div class="field-hint">刷誰的卡，帳單就會記在誰的卡帳上</div>' : ''}
          </div>
        ` : ''}

        ${type === 'income' ? `
          <div class="form-field" id="account-field" style="${isPersonal ? '' : 'display:none'}">
            <label>收入入帳</label>
            <select id="tx-account">
              <option value="">💵 現金</option>
              ${myAccounts.map(a => `
                <option value="${a.id}" ${editTx?.accountId === a.id ? 'selected' : ''}>${a.icon} ${a.name}</option>
              `).join('')}
            </select>
            <div class="field-hint">選擇帳戶後，該帳戶餘額會自動增加</div>
          </div>
        ` : ''}

        <div class="form-field">
          <label>分類</label>
          <div class="category-grid" id="category-grid">
            ${categories.map(c => `
              <button class="category-btn ${editTx?.category === c.id ? 'active' : ''}" data-cat="${c.id}" onclick="Pages.selectCategory(this)">
                <span class="cat-icon">${c.icon}</span>
                ${c.name}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form-field">
          <label>說明</label>
          <input type="text" id="tx-desc" placeholder="花費的項目（選填）" value="${editTx?.description || ''}">
        </div>

        <div class="form-field">
          <label>備註</label>
          <input type="text" id="tx-note" placeholder="備註紀錄" value="${editTx?.note || ''}">
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
      btns[2].classList.add('active-personal');
      payerField.style.display = 'none';
      if (cardField) cardField.style.display = '';
      if (accountField) accountField.style.display = '';
      updateCardOptions(Store.getCurrentUser());
    } else if (wallet === 'house_fund') {
      btns[1].classList.add('active-shared');
      payerField.style.display = '';
      if (cardField) cardField.style.display = 'none';
      if (accountField) accountField.style.display = 'none';
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
      userCards.map(c => `<option value="${c.id}" ${currentVal === c.id ? 'selected' : ''}>💳 ${c.name}</option>`).join('');
  }

  // ──────────── Credit Cards ────────────
  function renderCards() {
    const me = Store.getCurrentUser();
    const myCards = Store.getMyCreditCards();

    if (cardViewId) {
      return renderCardStatement(cardViewId);
    }

    return `
      <div class="card-section-title">我的信用卡</div>

      ${myCards.length > 0 ? myCards.map(card => {
        const unpaid = Store.getCardUnpaidAmount(card.id);
        const info = Store.getNextPaymentInfo(card);
        return `
          <div class="credit-card-visual" style="background:${card.color}" onclick="Pages.viewCardStatement('${card.id}')">
            <div>
              <div class="cc-name">${card.name}</div>
              <div class="cc-number">•••• •••• •••• ${card.lastFourDigits || '****'}</div>
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
      }).join('') : ''}

      <button class="add-card-btn" onclick="Pages.showAddCard()">
        + 新增信用卡
      </button>
    `;
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
      <button class="back-btn" onclick="Pages.closeCardStatement()">← 返回錢包</button>

      <div class="credit-card-visual" style="background:${card.color}" onclick="Pages.showCardDetail('${card.id}')">
        <div>
          <div class="cc-name">${card.name}</div>
          <div class="cc-number">•••• •••• •••• ${card.lastFourDigits || '****'}</div>
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
    App.navigate('cards');
  }

  function closeCardStatement() {
    cardViewId = null;
    App.navigate('wallet');
  }

  // ──────────── Wallet (錢包：帳戶 + 信用卡) ────────────
  function renderWallet() {
    const me = Store.getCurrentUser();
    const myAccounts = Store.getMyAccounts();
    const myCards = Store.getMyCreditCards();
    const totalBalance = myAccounts.reduce((s, a) => s + (a.balance || 0), 0);

    return `
      <div class="card" style="text-align:center;padding:20px">
        <div class="card-title">我的總資產</div>
        <div style="font-size:28px;font-weight:800;color:var(--primary)">${Utils.formatAmount(totalBalance)}</div>
      </div>

      <div class="wallet-section-title">帳戶</div>

      ${myAccounts.map(account => {
        const linkedCards = myCards.filter(c => c.linkedAccountId === account.id);
        return `
          <div class="account-card" onclick="Pages.showEditAccount('${account.id}')">
            <div class="account-card-top">
              <div class="account-card-icon">${account.icon}</div>
              <div class="account-card-info">
                <div class="account-card-name">${account.name}</div>
                ${linkedCards.length > 0 ? `<div class="account-card-linked">綁定：${linkedCards.map(c => c.name).join('、')}</div>` : ''}
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
        `;
      }).join('')}

      <button class="add-card-btn" onclick="Pages.showAddAccount()">+ 新增帳戶</button>

      <div class="wallet-section-title" style="margin-top:20px">信用卡</div>

      ${myCards.length > 0 ? myCards.map(card => {
        const unpaid = Store.getCardUnpaidAmount(card.id);
        return `
          <div class="credit-card-visual" style="background:${card.color}" onclick="Pages.viewCardStatement('${card.id}')">
            <div>
              <div class="cc-name">${card.name}</div>
              <div class="cc-number">•••• •••• •••• ${card.lastFourDigits || '****'}</div>
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
      }).join('') : ''}

      <button class="add-card-btn" onclick="Pages.showAddCard()">+ 新增信用卡</button>
    `;
  }

  // ──────────── Accounts (kept for internal use) ────────────
  function renderAccounts() {
    return renderWallet();
  }

  function showAddAccount(editAccount) {
    const isEdit = !!editAccount;
    const ACCOUNT_ICONS = ['🏦', '💰', '🏧', '💳', '🐷', '📱', '💵', '🪙'];

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${isEdit ? '編輯帳戶' : '新增帳戶'}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>帳戶名稱</label>
          <input type="text" id="acct-name" placeholder="例：台新銀行" value="${editAccount?.name || ''}">
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

  function saveAccount(editId) {
    const name = document.getElementById('acct-name').value.trim();
    if (!name) { Utils.showToast('請輸入帳戶名稱'); return; }

    const me = Store.getCurrentUser();
    const account = {
      name,
      icon: document.getElementById('acct-icon-val').value,
      balance: parseFloat(document.getElementById('acct-balance').value) || 0,
      ownerId: me,
    };

    if (editId) {
      Store.updateAccount(editId, account);
      Utils.showToast('已更新帳戶');
    } else {
      Store.addAccount(account);
      Utils.showToast('已新增帳戶！');
    }
    hideModal();
    App.navigate('accounts');
  }

  function deleteAccount(id) {
    if (confirm('確定要刪除這個帳戶嗎？')) {
      const cards = Store.getMyCreditCards().filter(c => c.linkedAccountId === id);
      cards.forEach(c => Store.updateCreditCard(c.id, { linkedAccountId: '' }));
      Store.deleteAccount(id);
      hideModal();
      Utils.showToast('已刪除帳戶');
      App.navigate('accounts');
    }
  }

  function showAdjustBalance(accountId, mode) {
    const account = Store.getAccounts().find(a => a.id === accountId);
    if (!account) return;

    const titles = { income: '收入入帳', expense: '手動扣款', set: '更新餘額' };
    const placeholders = { income: '入帳金額', expense: '扣款金額', set: '新的餘額' };

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${account.icon} ${account.name} — ${titles[mode]}</div>
        <button class="modal-close" onclick="Pages.hideModal()">✕</button>
      </div>
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:13px;color:var(--text-secondary)">目前餘額</div>
        <div style="font-size:22px;font-weight:800">${Utils.formatAmount(account.balance || 0)}</div>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>${placeholders[mode]}</label>
          <input type="number" id="adjust-amount" placeholder="0" inputmode="decimal" autofocus
            style="font-size:24px;text-align:center;font-weight:700">
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

    const account = Store.getAccounts().find(a => a.id === accountId);
    if (!account) return;

    if (mode === 'set') {
      Store.updateAccount(accountId, { balance: val });
      Utils.showToast('餘額已更新');
    } else if (mode === 'income') {
      Store.adjustAccountBalance(accountId, val);
      Utils.showToast(`已入帳 ${Utils.formatAmount(val)}`);
    } else {
      Store.adjustAccountBalance(accountId, -val);
      Utils.showToast(`已扣款 ${Utils.formatAmount(val)}`);
    }

    hideModal();
    App.navigate('accounts');
  }

  // ──────────── Settings ────────────
  function renderSettings() {
    const settings = Store.getSettings();
    const me = Store.getCurrentUser();
    const meInfo = settings.users.find(u => u.id === me);

    return `
      <div class="settings-group">
        <div class="settings-group-title">我的帳號</div>
        <div class="settings-item" onclick="Pages.editUser('${me}')">
          <div class="settings-item-left">
            <div class="settings-item-icon">${meInfo.emoji}</div>
            <div class="settings-item-label">${meInfo.name}</div>
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
            <div class="settings-item-icon">🗑️</div>
            <div class="settings-item-label" style="color:var(--danger)">清除所有資料</div>
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
  }

  function hideModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  function showTxDetail(txId) {
    const tx = Store.getVisibleTransactions().find(t => t.id === txId);
    if (!tx) return;
    const me = Store.getCurrentUser();
    const cat = Utils.getCategoryInfo(tx.category, tx.type);
    const user = Utils.getUserInfo(tx.userId);
    const card = tx.creditCardId ? Store.getCreditCards().find(c => c.id === tx.creditCardId) : null;
    const canEdit = tx.userId === me || tx.walletType === 'shared';

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${cat.icon} ${tx.description || cat.name}</div>
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
        <div class="detail-value">${cat.icon} ${cat.name}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">日期</div>
        <div class="detail-value">${Utils.formatFullDate(tx.date)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">記錄者</div>
        <div class="detail-value">${user.emoji} ${user.name}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">錢包</div>
        <div class="detail-value">${tx.walletType === 'house_fund' ? '🏠 買房基金' : tx.walletType === 'shared' ? '💑 共用錢包' : '👤 個人'}</div>
      </div>
      ${card ? `
        <div class="detail-row">
          <div class="detail-label">信用卡</div>
          <div class="detail-value">${card.name}</div>
        </div>
      ` : ''}
      ${tx.note ? `
        <div class="detail-row">
          <div class="detail-label">備註</div>
          <div class="detail-value">${tx.note}</div>
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
          <input type="text" id="card-name" placeholder="例：中信 LINE Pay" value="${editCard?.name || ''}">
        </div>
        <div class="form-field">
          <label>卡號末四碼</label>
          <input type="text" id="card-digits" placeholder="1234" maxlength="4" value="${editCard?.lastFourDigits || ''}">
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
              <option value="${a.id}" ${editCard?.linkedAccountId === a.id ? 'selected' : ''}>${a.icon} ${a.name}</option>
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
            <span class="cat-manage-icon">${c.icon}</span>
            <span class="cat-manage-name">${c.name}</span>
            <div class="cat-manage-actions">
              <button class="cat-manage-btn" onclick="Pages.showEditCategory('${type}','${c.id}')">✏️</button>
              ${(c.id !== 'other' && c.id !== 'other_income')
                ? `<button class="cat-manage-btn danger" onclick="Pages.confirmDeleteCategory('${type}','${c.id}','${c.name}')">🗑️</button>`
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
          <input type="text" id="custom-cat-icon" value="${cat.icon}" style="font-size:24px;text-align:center;margin-top:8px" maxlength="2">
        </div>
        <div class="form-field">
          <label>分類名稱</label>
          <input type="text" id="custom-cat-name" value="${cat.name}">
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

  function confirmDeleteCategory(type, catId, catName) {
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
    const walletType = document.getElementById('tx-wallet').value;
    const accountId = document.getElementById('tx-account')?.value || '';

    const tx = {
      amount,
      type,
      category: activeCategory.dataset.cat,
      description: document.getElementById('tx-desc').value.trim(),
      note: document.getElementById('tx-note').value.trim(),
      date: document.getElementById('tx-date').value,
      userId: walletType === 'personal' ? me : (document.getElementById('tx-user').value === 'shared_wallet' ? 'shared_wallet' : document.getElementById('tx-user').value),
      walletType,
      creditCardId: type === 'expense' && document.getElementById('tx-user')?.value !== 'shared_wallet' ? (document.getElementById('tx-card')?.value || '') : '',
      accountId: type === 'income' && walletType === 'personal' ? accountId : '',
    };

    if (editId) {
      Store.updateTransaction(editId, tx);
      Utils.showToast('已更新紀錄');
    } else {
      Store.addTransaction(tx);

      if (type === 'income' && walletType === 'personal' && accountId) {
        Store.adjustAccountBalance(accountId, amount);
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
    App.navigate('wallet');
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
      App.navigate('wallet');
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
          <input type="text" id="edit-user-name" value="${user.name}">
        </div>
        <div class="form-field">
          <label>表情符號</label>
          <input type="text" id="edit-user-emoji" value="${user.emoji}" style="font-size:24px;text-align:center;">
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
              style="text-align:center;font-size:20px;letter-spacing:6px;">
          </div>
          <div class="form-field">
            <label>新 PIN 碼（留空則移除）</label>
            <input type="password" id="new-pin" inputmode="numeric" maxlength="6"
              style="text-align:center;font-size:20px;letter-spacing:6px;">
          </div>
        </div>
      ` : `
        <div class="form-grid">
          <div class="form-field">
            <label>設定 PIN 碼（4~6 碼數字）</label>
            <input type="password" id="new-pin" inputmode="numeric" maxlength="6"
              style="text-align:center;font-size:20px;letter-spacing:6px;" autofocus>
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
      reader.onload = (ev) => {
        if (Store.importData(ev.target.result)) {
          Utils.showToast('匯入成功！');
          App.navigate('dashboard');
        } else {
          Utils.showToast('匯入失敗，檔案格式不正確');
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
              <span>${cat.icon}</span>
              <span style="flex:1">${tx.description || cat.name}</span>
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
    if (confirm('確定要清除所有資料嗎？此操作無法復原！')) {
      localStorage.clear();
      Utils.showToast('已清除所有資料');
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
    walletFilter = f;
    App.refresh();
  }

  function resetFilters() {
    walletFilter = 'shared';
    cardViewId = null;
    editingTx = null;
    addTxType = 'expense';
    txViewMode = 'list';
    calendarSelectedDate = null;
    dashboardTab = 'personal';
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
    exportData,
    importData,
    showNotionImport,
    pickNotionCsv,
    confirmNotionImport,
    clearData,
    switchTxType,
    prevMonth,
    nextMonth,
    setWalletFilter,
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
