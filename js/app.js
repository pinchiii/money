const App = (() => {
  const DEVICE_KEY = 'pinchi_device_bound';
  const ACCESS_CODE = 'pinchi2026';

  let currentPage = 'dashboard';

  const PAGE_TITLES = {
    login: '輕鬆記帳',
    dashboard: '首頁',
    transactions: '明細',
    add: '記帳',
    wallet: '個人資產',
    creditCards: '信用卡',
    cardStatement: '我的卡片',
    settings: '設定',
  };

  const PAGE_RENDERERS = {
    login: Pages.renderLogin,
    dashboard: Pages.renderDashboard,
    transactions: Pages.renderTransactions,
    add: Pages.renderAddTransaction,
    wallet: Pages.renderWallet,
    creditCards: Pages.renderCreditCards,
    cardStatement: Pages.renderCards,
    settings: Pages.renderSettings,
  };

  function isDeviceBound() {
    return localStorage.getItem(DEVICE_KEY) === 'true';
  }

  function showGate() {
    document.getElementById('tab-bar').classList.add('hidden');
    document.getElementById('settings-btn').classList.add('hidden');
    document.getElementById('page-title').textContent = '輕鬆記帳';
    document.getElementById('page-container').innerHTML = `
      <div class="login-screen">
        <div class="login-logo">🔐</div>
        <h2 class="login-title">裝置驗證</h2>
        <p class="login-subtitle">首次使用請輸入通行密碼</p>
        <div style="width:100%;max-width:280px">
          <div class="form-field">
            <input type="password" id="gate-code" placeholder="請輸入通行密碼"
              style="text-align:center;font-size:18px;letter-spacing:2px" autofocus>
          </div>
          <button class="submit-btn expense" style="background:var(--primary);box-shadow:0 4px 14px rgba(122,158,126,0.3);margin-top:16px"
            onclick="App.verifyGate()">驗證</button>
          <p id="gate-error" style="color:var(--expense-color);text-align:center;margin-top:12px;font-size:13px;display:none">
            密碼錯誤，請重新輸入
          </p>
        </div>
      </div>
    `;
    setTimeout(() => {
      const input = document.getElementById('gate-code');
      if (input) {
        input.focus();
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') App.verifyGate();
        });
      }
    }, 100);
  }

  function verifyGate() {
    const input = document.getElementById('gate-code');
    if (!input) return;

    if (input.value === ACCESS_CODE) {
      localStorage.setItem(DEVICE_KEY, 'true');
      init();
    } else {
      document.getElementById('gate-error').style.display = 'block';
      input.value = '';
      input.focus();
    }
  }

  function navigate(page) {
    if (page !== 'login' && !Store.getCurrentUser()) {
      page = 'login';
    }

    currentPage = page;

    if (page !== 'add') {
      Pages.resetEditingTx();
    }

    document.getElementById('page-title').textContent = PAGE_TITLES[page];
    document.getElementById('page-container').innerHTML = PAGE_RENDERERS[page]();

    const tabBar = document.getElementById('tab-bar');
    const settingsBtn = document.getElementById('settings-btn');
    if (page === 'login') {
      tabBar.classList.add('hidden');
      settingsBtn.classList.add('hidden');
    } else {
      tabBar.classList.remove('hidden');
      if (page === 'settings') {
        settingsBtn.classList.add('hidden');
      } else {
        settingsBtn.classList.remove('hidden');
      }
    }

    document.querySelectorAll('.tab-item').forEach(tab => {
      const tabPage = tab.dataset.page;
      const isActive = tabPage === page || (tabPage === 'creditCards' && page === 'cardStatement');
      tab.classList.toggle('active', isActive);
    });

    window.scrollTo(0, 0);
  }

  function refresh() {
    navigate(currentPage);
  }

  function logout() {
    Store.logout();
    Pages.resetFilters();
    navigate('login');
  }

  async function init() {
    if (!isDeviceBound()) {
      showGate();
      return;
    }

    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => navigate(tab.dataset.page));
    });

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) Pages.hideModal();
    });

    if (Store.getCurrentUser()) {
      navigate('dashboard');
      const synced = await Store.syncFromCloud();
      if (synced) {
        navigate('dashboard');
      }
      const newBills = Store.processCardBills();
      if (newBills > 0) {
        setTimeout(() => Utils.showToast(`已自動處理 ${newBills} 筆信用卡扣款`), 500);
      }
    } else {
      navigate('login');
      await Store.syncFromCloud();
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/money/sw.js').catch(() => {});
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, refresh, logout, verifyGate };
})();
