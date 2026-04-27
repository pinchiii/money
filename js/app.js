const App = (() => {
  let currentPage = 'dashboard';

  const PAGE_TITLES = {
    login: 'Pinchi',
    dashboard: '首頁',
    transactions: '明細',
    add: '記帳',
    wallet: '錢包',
    cards: '我的卡片',
    settings: '設定',
  };

  const PAGE_RENDERERS = {
    login: Pages.renderLogin,
    dashboard: Pages.renderDashboard,
    transactions: Pages.renderTransactions,
    add: Pages.renderAddTransaction,
    wallet: Pages.renderWallet,
    cards: Pages.renderCards,
    settings: Pages.renderSettings,
  };

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
      tab.classList.toggle('active', tab.dataset.page === page);
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
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, refresh, logout };
})();
