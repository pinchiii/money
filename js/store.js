const Store = (() => {
  const CACHE = {
    transactions: 'pinchi_transactions',
    creditCards: 'pinchi_credit_cards',
    accounts: 'pinchi_accounts',
    settings: 'pinchi_settings',
    currentUser: 'pinchi_current_user',
    autoBills: 'pinchi_auto_bills',
    expenseCats: 'pinchi_expense_categories',
    incomeCats: 'pinchi_income_categories',
    stocks: 'pinchi_stocks',
    stockTxs: 'pinchi_stock_txs',
    finnhubKey: 'pinchi_finnhub_key',
    pendingWrites: 'pinchi_pending_writes',
    billBackfillFrom: 'pinchi_bill_backfill_from',
  };

  const DEFAULT_SETTINGS = {
    users: [
      { id: 'user1', name: '品琪', emoji: '👧', pin: '' },
      { id: 'user2', name: '崇軒', emoji: '👦', pin: '' },
    ],
    currency: 'NT$',
    usdToTwdRate: 32,
    houseFund: { openingBalance: 0 },
  };

  const DEFAULT_EXPENSE_CATEGORIES = [
    { id: 'food', icon: '🍔', name: '飲食' },
    { id: 'entertainment', icon: '🎮', name: '娛樂' },
    { id: 'living', icon: '🏠', name: '生活' },
    { id: 'other', icon: '📌', name: '其他' },
  ];

  const DEFAULT_INCOME_CATEGORIES = [
    { id: 'salary', icon: '💰', name: '薪水' },
    { id: 'bonus', icon: '🎉', name: '獎金' },
    { id: 'investment', icon: '📈', name: '投資' },
    { id: 'side', icon: '💼', name: '副業' },
    { id: 'refund', icon: '🔄', name: '退款' },
    { id: 'other_income', icon: '💵', name: '其他' },
  ];

  function loadCache(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }

  function saveCache(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function uid() {
    // 時間戳 + 8 字元加密隨機，降低雙裝置同毫秒 / 大量匯入時的碰撞機率
    let rand = '';
    if (window.crypto && crypto.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      rand = Array.from(bytes, b => (b % 36).toString(36)).join('');
    } else {
      rand = Math.random().toString(36).slice(2, 10);
    }
    return Date.now().toString(36) + rand;
  }

  // ── 雲端寫入（失敗可察覺 + 離線暫存補傳）──
  // Supabase 失敗是 resolve 成 {error} 而非 reject，所以一律檢查 res.error。
  // 失敗的寫入存進 pendingWrites，下次 syncFromCloud 前先補傳，避免被雲端資料覆蓋而遺失。
  let _lastSyncErrToast = 0;
  function notifySyncError(msg) {
    console.error('[雲端同步失敗]', msg);
    const now = Date.now();
    if (now - _lastSyncErrToast > 5000 && typeof Utils !== 'undefined') {
      _lastSyncErrToast = now;
      Utils.showToast('⚠️ 雲端同步失敗，已暫存，恢復連線後自動補傳');
    }
  }

  function getPendingWrites() {
    return loadCache(CACHE.pendingWrites) || [];
  }

  function enqueuePending(op) {
    const q = getPendingWrites();
    q.push(op);
    saveCache(CACHE.pendingWrites, q);
  }

  async function execSettingsMerge(op) {
    // 只覆蓋這次變更的 key，其餘以雲端最新值為準，避免整包蓋掉對方的修改
    const cur = await db.from('settings').select('data').eq('id', 'global').single();
    const base = (cur.data && cur.data.data) ? cur.data.data : {};
    const merged = { ...op.payload.data, ...base };
    op.payload.keys.forEach(k => { merged[k] = op.payload.data[k]; });
    saveCache(CACHE.settings, merged);
    return db.from('settings').upsert({ id: 'global', data: merged, updated_at: new Date().toISOString() });
  }

  function execOp(op) {
    if (op.op === 'merge_settings') return execSettingsMerge(op);
    const t = db.from(op.table);
    if (op.op === 'insert') return t.insert(op.payload);
    if (op.op === 'upsert') return t.upsert(op.payload);
    if (op.op === 'update') {
      let q = t.update(op.payload);
      Object.entries(op.match || {}).forEach(([k, v]) => { q = q.eq(k, v); });
      return q;
    }
    if (op.op === 'delete') {
      let q = t.delete();
      Object.entries(op.match || {}).forEach(([k, v]) => { q = q.eq(k, v); });
      return q;
    }
    return Promise.resolve({ error: { message: 'unknown op: ' + op.op } });
  }

  function cloudWrite(table, opType, payload, match) {
    const op = { table, op: opType, payload, match };
    Promise.resolve(execOp(op)).then(
      res => {
        if (res && res.error) {
          enqueuePending(op);
          notifySyncError(res.error.message);
        }
      },
      err => {
        enqueuePending(op);
        notifySyncError(err && err.message);
      }
    );
  }

  // 回傳仍未成功的資料表集合，syncFromCloud 會跳過覆蓋這些表的本機快取
  async function flushPendingWrites() {
    const queue = getPendingWrites();
    if (queue.length === 0) return new Set();
    const remaining = [];
    for (const op of queue) {
      try {
        const res = await execOp(op);
        // 23505 = 重複鍵：代表上次其實已寫入成功，直接視為完成
        if (res && res.error && res.error.code !== '23505') remaining.push(op);
      } catch {
        remaining.push(op);
      }
    }
    saveCache(CACHE.pendingWrites, remaining);
    if (remaining.length > 0) notifySyncError(`仍有 ${remaining.length} 筆變更未同步`);
    return new Set(remaining.map(o => o.table));
  }

  // Supabase helper: convert DB row to app format
  function dbTxToApp(row) {
    return {
      id: row.id,
      amount: Number(row.amount),
      type: row.type,
      category: row.category,
      description: row.description || '',
      note: row.note || '',
      date: row.date,
      userId: row.user_id,
      walletType: row.wallet_type,
      creditCardId: row.credit_card_id || '',
      accountId: row.account_id || '',
      isAutoBill: row.is_auto_bill || false,
      createdAt: row.created_at,
    };
  }

  function appTxToDb(tx) {
    return {
      id: tx.id,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      description: tx.description || '',
      note: tx.note || '',
      date: tx.date,
      user_id: tx.userId,
      wallet_type: tx.walletType,
      credit_card_id: tx.creditCardId || '',
      account_id: tx.accountId || '',
      is_auto_bill: tx.isAutoBill || false,
      created_at: tx.createdAt,
    };
  }

  function dbCardToApp(row) {
    return {
      id: row.id,
      name: row.name,
      lastFourDigits: row.last_four_digits || '',
      ownerId: row.owner_id,
      statementDay: row.statement_day,
      paymentDay: row.payment_day,
      linkedAccountId: row.linked_account_id || '',
      color: row.color || '#7A9E7E',
    };
  }

  function appCardToDb(card) {
    return {
      id: card.id,
      name: card.name,
      last_four_digits: card.lastFourDigits || '',
      owner_id: card.ownerId,
      statement_day: card.statementDay,
      payment_day: card.paymentDay,
      linked_account_id: card.linkedAccountId || '',
      color: card.color || '#7A9E7E',
    };
  }

  function dbAccToApp(row) {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon || '🏦',
      balance: Number(row.balance || 0),
      ownerId: row.owner_id,
      assetScope: row.asset_scope || 'personal',
    };
  }

  function appAccToDb(acc) {
    return {
      id: acc.id,
      name: acc.name,
      icon: acc.icon || '🏦',
      balance: acc.balance || 0,
      owner_id: acc.ownerId,
      asset_scope: acc.assetScope || 'personal',
    };
  }

  function dbCatToApp(row) {
    return { id: row.cat_id, icon: row.icon, name: row.name };
  }

  function dbStockToApp(row) {
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name || '',
      market: row.market || 'us',
      shares: Number(row.shares || 0),
      avgCost: Number(row.avg_cost || 0),
      currentPrice: Number(row.current_price || 0),
      lastUpdated: row.last_updated || null,
      ownerId: row.owner_id,
      assetScope: row.asset_scope || 'personal',
    };
  }

  function appStockToDb(stock) {
    return {
      id: stock.id,
      symbol: stock.symbol,
      name: stock.name || '',
      market: stock.market || 'us',
      shares: stock.shares || 0,
      avg_cost: stock.avgCost || 0,
      current_price: stock.currentPrice || 0,
      last_updated: stock.lastUpdated || null,
      owner_id: stock.ownerId,
      asset_scope: stock.assetScope || 'personal',
    };
  }

  function dbStockTxToApp(row) {
    return {
      id: row.id,
      stockId: row.stock_id,
      symbol: row.symbol,
      type: row.type,
      shares: Number(row.shares),
      price: Number(row.price),
      date: row.date,
      createdAt: row.created_at,
    };
  }

  function appStockTxToDb(tx) {
    return {
      id: tx.id,
      stock_id: tx.stockId,
      symbol: tx.symbol,
      type: tx.type,
      shares: tx.shares,
      price: tx.price,
      date: tx.date,
      created_at: tx.createdAt,
    };
  }

  // ── Sync from Supabase on startup ──
  async function syncFromCloud() {
    // 先補傳離線/失敗的寫入；還沒送出去的表不能被雲端資料覆蓋，否則本機新紀錄會遺失
    const pending = await flushPendingWrites();
    try {
      const [txRes, cardRes, accRes, settRes, catRes, billRes, stockRes, stockTxRes] = await Promise.all([
        db.from('transactions').select('*').order('created_at', { ascending: false }),
        db.from('credit_cards').select('*'),
        db.from('accounts').select('*'),
        db.from('settings').select('*').eq('id', 'global').single(),
        db.from('categories').select('*'),
        db.from('auto_bills').select('*'),
        db.from('stocks').select('*'),
        db.from('stock_transactions').select('*').order('created_at', { ascending: false }),
      ]);

      if (txRes.data && !pending.has('transactions')) {
        saveCache(CACHE.transactions, txRes.data.map(dbTxToApp));
      }
      if (cardRes.data && !pending.has('credit_cards')) {
        saveCache(CACHE.creditCards, cardRes.data.map(dbCardToApp));
      }
      if (accRes.data && !pending.has('accounts')) {
        saveCache(CACHE.accounts, accRes.data.map(dbAccToApp));
      }
      if (settRes.data && !pending.has('settings')) {
        saveCache(CACHE.settings, settRes.data.data);
        if (settRes.data.data?.finnhubKey) {
          saveCache(CACHE.finnhubKey, settRes.data.data.finnhubKey);
        }
      }
      if (catRes.data && !pending.has('categories')) {
        const expCats = catRes.data.filter(c => c.type === 'expense').map(dbCatToApp);
        const incCats = catRes.data.filter(c => c.type === 'income').map(dbCatToApp);
        if (expCats.length > 0) saveCache(CACHE.expenseCats, expCats);
        if (incCats.length > 0) saveCache(CACHE.incomeCats, incCats);
      }
      if (billRes.data && !pending.has('auto_bills')) {
        saveCache(CACHE.autoBills, billRes.data.map(b => b.bill_key));
      }
      if (stockRes.data && !pending.has('stocks')) {
        saveCache(CACHE.stocks, stockRes.data.map(dbStockToApp));
      }
      if (stockTxRes.data && !pending.has('stock_transactions')) {
        saveCache(CACHE.stockTxs, stockTxRes.data.map(dbStockTxToApp));
      }
      return true;
    } catch (e) {
      console.warn('Sync failed, using local cache:', e);
      return false;
    }
  }

  // ── Categories ──
  function getExpenseCategories() {
    return loadCache(CACHE.expenseCats) || JSON.parse(JSON.stringify(DEFAULT_EXPENSE_CATEGORIES));
  }
  function getIncomeCategories() {
    return loadCache(CACHE.incomeCats) || JSON.parse(JSON.stringify(DEFAULT_INCOME_CATEGORIES));
  }

  function addCategory(type, cat) {
    const cats = type === 'income' ? getIncomeCategories() : getExpenseCategories();
    cats.push(cat);
    if (type === 'income') saveCache(CACHE.incomeCats, cats);
    else saveCache(CACHE.expenseCats, cats);

    cloudWrite('categories', 'insert', { cat_id: cat.id, icon: cat.icon, name: cat.name, type });
    return cats;
  }

  function updateCategory(type, id, updates) {
    const cats = type === 'income' ? getIncomeCategories() : getExpenseCategories();
    const cat = cats.find(c => c.id === id);
    if (!cat) return cats;
    Object.assign(cat, updates);
    if (type === 'income') saveCache(CACHE.incomeCats, cats);
    else saveCache(CACHE.expenseCats, cats);

    const dbUpdates = {};
    if (updates.icon) dbUpdates.icon = updates.icon;
    if (updates.name) dbUpdates.name = updates.name;
    cloudWrite('categories', 'update', dbUpdates, { cat_id: id, type });
    return cats;
  }

  function deleteCategory(type, id) {
    let cats = type === 'income' ? getIncomeCategories() : getExpenseCategories();
    cats = cats.filter(c => c.id !== id);
    if (type === 'income') saveCache(CACHE.incomeCats, cats);
    else saveCache(CACHE.expenseCats, cats);

    cloudWrite('categories', 'delete', null, { cat_id: id, type });
    return cats;
  }

  return {
    syncFromCloud,

    get EXPENSE_CATEGORIES() { return getExpenseCategories(); },
    get INCOME_CATEGORIES() { return getIncomeCategories(); },
    getExpenseCategories,
    getIncomeCategories,
    addCategory,
    updateCategory,
    deleteCategory,

    // ── Session (local only) ──
    getCurrentUser() {
      return loadCache(CACHE.currentUser);
    },
    setCurrentUser(userId) {
      saveCache(CACHE.currentUser, userId);
    },
    logout() {
      localStorage.removeItem(CACHE.currentUser);
    },

    // ── Settings ──
    getSettings() {
      return loadCache(CACHE.settings) || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    },
    // changedKeys：這次實際變更的頂層 key（如 ['houseFund']）。
    // 有指定時只合併覆蓋這些 key，避免整包 upsert 把對方裝置剛改的其他設定蓋掉。
    saveSettings(s, changedKeys) {
      saveCache(CACHE.settings, s);
      if (changedKeys && changedKeys.length) {
        cloudWrite('settings', 'merge_settings', { keys: changedKeys, data: s });
      } else {
        cloudWrite('settings', 'upsert', { id: 'global', data: s, updated_at: new Date().toISOString() });
      }
    },

    // ── 買房基金存款（存在 settings，兩人共用）──
    // 存款餘額 = openingBalance（切換時的起始基準）＋ 所有共同帳本/房基金交易淨額。
    // 共同帳本收入＝存入(+)、支出＝提出(-)，房基金手動存入/提出同理。
    houseFundTxNet() {
      return this.getTransactions().reduce((sum, tx) => {
        if (tx.walletType !== 'shared' && tx.walletType !== 'house_fund') return sum;
        return sum + (tx.type === 'income' ? Number(tx.amount || 0) : -Number(tx.amount || 0));
      }, 0);
    },
    getHouseFundBalances() {
      const s = this.getSettings();
      const txNet = this.houseFundTxNet();

      // 已完成遷移 → 直接推導
      if (s.houseFund && s.houseFund.openingBalance !== undefined) {
        return { cashDeposit: Number(s.houseFund.openingBalance || 0) + txNet };
      }

      // 一次性遷移：把舊的累計數字 cashDeposit 轉成「只算今後」的起始基準，
      // 讓切換當下顯示的餘額維持不變（過去的收支歸進 openingBalance）。
      const legacy = Number(
        s.houseFund && s.houseFund.cashDeposit != null
          ? s.houseFund.cashDeposit
          : this.getHouseFundAccounts().reduce((sum, a) => sum + (a.balance || 0), 0)
      );
      // 只有在雲端交易確實載入後才凍結起始基準，避免首次繪製時交易還沒同步就被錨定成空集合
      if (loadCache(CACHE.transactions) !== null) {
        s.houseFund = { openingBalance: legacy - txNet };
        this.saveSettings(s, ['houseFund']);
      }
      return { cashDeposit: legacy };
    },
    // 設定餘額：反推 openingBalance，使顯示餘額等於 target
    setHouseFundBalance(target) {
      const s = this.getSettings();
      s.houseFund = { openingBalance: Number(target || 0) - this.houseFundTxNet() };
      this.saveSettings(s, ['houseFund']);
      return Number(target || 0);
    },

    getHouseFundDepositTxs(limit = 20) {
      return this.getTransactions()
        .filter(tx => tx.walletType === 'house_fund' || tx.walletType === 'shared')
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, limit);
    },

    // ── Accounts ──
    getAccounts() {
      return loadCache(CACHE.accounts) || [];
    },
    getMyAccounts() {
      const me = this.getCurrentUser();
      return this.getAccounts().filter(a =>
        (a.assetScope || 'personal') === 'personal' && a.ownerId === me
      );
    },
    getHouseFundAccounts() {
      return this.getAccounts().filter(a => (a.assetScope || 'personal') === 'house_fund');
    },
    addAccount(account) {
      const list = this.getAccounts();
      account.id = uid();
      const scope = account.assetScope || 'personal';
      account.assetScope = scope;
      if (scope === 'house_fund') {
        account.ownerId = 'house_fund';
      } else if (!account.ownerId) {
        account.ownerId = this.getCurrentUser();
      }
      list.push(account);
      saveCache(CACHE.accounts, list);
      cloudWrite('accounts', 'insert', appAccToDb(account));
      return account;
    },
    updateAccount(id, updates) {
      const list = this.getAccounts();
      const idx = list.findIndex(a => a.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates };
        saveCache(CACHE.accounts, list);
        cloudWrite('accounts', 'update', appAccToDb(list[idx]), { id });
      }
    },
    deleteAccount(id) {
      const list = this.getAccounts().filter(a => a.id !== id);
      saveCache(CACHE.accounts, list);
      cloudWrite('accounts', 'delete', null, { id });
    },
    adjustAccountBalance(id, delta) {
      const list = this.getAccounts();
      const idx = list.findIndex(a => a.id === id);
      if (idx >= 0) {
        list[idx].balance = (list[idx].balance || 0) + delta;
        saveCache(CACHE.accounts, list);
        cloudWrite('accounts', 'update', { balance: list[idx].balance }, { id });
      }
    },

    // ── Transactions ──
    getTransactions() {
      return loadCache(CACHE.transactions) || [];
    },

    getVisibleTransactions() {
      const me = this.getCurrentUser();
      return this.getTransactions().filter(tx =>
        tx.walletType === 'shared' || tx.walletType === 'house_fund' || tx.userId === me
      );
    },

    getVisibleTransactionsForMonth(year, month) {
      // 直接比對 YYYY-MM 字串，避免 new Date(tx.date) 的 UTC 解析在時區邊界跑掉
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      return this.getVisibleTransactions().filter(tx => (tx.date || '').startsWith(prefix));
    },

    getMyCardIds() {
      const me = this.getCurrentUser();
      return this.getCreditCards().filter(c => c.ownerId === me).map(c => c.id);
    },

    isAdvancedByMe(tx) {
      if (tx.walletType !== 'shared' || tx.type !== 'expense' || !tx.creditCardId) return false;
      return this.getMyCardIds().includes(tx.creditCardId);
    },

    getMyPocketTransactions(txs) {
      const me = this.getCurrentUser();
      const myCardIds = this.getMyCardIds();
      return txs.filter(tx => {
        if (tx.walletType === 'personal' && tx.userId === me) return true;
        if (tx.walletType === 'shared' && tx.type === 'expense' && tx.creditCardId && myCardIds.includes(tx.creditCardId)) return true;
        return false;
      });
    },

    // 交易對連動帳戶餘額的影響：income 為 +、expense 為 −。
    // sign = +1 套用（新增）、-1 回沖（刪除或編輯前的舊值）
    applyTxToAccount(tx, sign) {
      if (!tx || !tx.accountId) return;
      const delta = (tx.type === 'income' ? 1 : -1) * Number(tx.amount || 0) * sign;
      if (delta) this.adjustAccountBalance(tx.accountId, delta);
    },

    addTransaction(tx) {
      const list = this.getTransactions();
      tx.id = uid();
      tx.createdAt = new Date().toISOString();
      list.unshift(tx);
      saveCache(CACHE.transactions, list);
      cloudWrite('transactions', 'insert', appTxToDb(tx));
      this.applyTxToAccount(tx, 1);
      return tx;
    },

    bulkAddTransactions(txs) {
      const list = this.getTransactions();
      txs.forEach(tx => {
        tx.id = uid();
        tx.createdAt = new Date().toISOString();
        list.unshift(tx);
      });
      saveCache(CACHE.transactions, list);
      const dbRows = txs.map(appTxToDb);
      cloudWrite('transactions', 'insert', dbRows);
      return txs.length;
    },

    updateTransaction(id, updates) {
      const list = this.getTransactions();
      const idx = list.findIndex(t => t.id === id);
      if (idx >= 0) {
        const old = list[idx];
        const merged = { ...old, ...updates };
        // 先回沖舊值再套用新值，讓連動帳戶餘額跟著編輯結果修正
        this.applyTxToAccount(old, -1);
        list[idx] = merged;
        saveCache(CACHE.transactions, list);
        cloudWrite('transactions', 'update', appTxToDb(merged), { id });
        this.applyTxToAccount(merged, 1);
      }
    },

    deleteTransaction(id) {
      const all = this.getTransactions();
      const target = all.find(t => t.id === id);
      const list = all.filter(t => t.id !== id);
      saveCache(CACHE.transactions, list);
      cloudWrite('transactions', 'delete', null, { id });
      // 刪除有連動帳戶的交易（收入入帳／手動扣款／信用卡自動扣款）時回沖餘額
      this.applyTxToAccount(target, -1);
    },

    // ── Credit Cards ──
    getCreditCards() {
      return loadCache(CACHE.creditCards) || [];
    },

    getMyCreditCards() {
      const me = this.getCurrentUser();
      return this.getCreditCards().filter(c => c.ownerId === me);
    },

    addCreditCard(card) {
      const list = this.getCreditCards();
      card.id = uid();
      list.push(card);
      saveCache(CACHE.creditCards, list);
      cloudWrite('credit_cards', 'insert', appCardToDb(card));
      return card;
    },

    updateCreditCard(id, updates) {
      const list = this.getCreditCards();
      const idx = list.findIndex(c => c.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates };
        saveCache(CACHE.creditCards, list);
        cloudWrite('credit_cards', 'update', appCardToDb(list[idx]), { id });
      }
    },

    deleteCreditCard(id) {
      const list = this.getCreditCards().filter(c => c.id !== id);
      saveCache(CACHE.creditCards, list);
      cloudWrite('credit_cards', 'delete', null, { id });
    },

    // 待繳金額 = 下次扣款日要繳的那期帳單（結帳日已過就是已結帳金額；
    // 還沒結帳則是累計中的當期消費），與 processCardBills 實際扣款金額一致
    getCardUnpaidAmount(cardId) {
      const card = this.getCreditCards().find(c => c.id === cardId);
      if (!card) return 0;
      const info = this.getNextPaymentInfo(card);
      return this.getCardBillForPeriod(cardId, info.stmtDate.getFullYear(), info.stmtDate.getMonth());
    },

    getCardBillForPeriod(cardId, year, month) {
      const card = this.getCreditCards().find(c => c.id === cardId);
      if (!card) return 0;
      const stmtDay = card.statementDay;
      const start = new Date(year, month - 1, stmtDay + 1);
      const end = new Date(year, month, stmtDay);
      return this.getTransactions()
        .filter(tx => {
          if (tx.creditCardId !== cardId || tx.type !== 'expense') return false;
          const d = new Date(tx.date);
          return d >= start && d <= end;
        })
        .reduce((sum, tx) => sum + tx.amount, 0);
    },

    getCardTransactions(cardId) {
      return this.getTransactions().filter(tx =>
        tx.creditCardId === cardId && tx.type === 'expense'
      );
    },

    getCardTransactionsForMonth(cardId, year, month) {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      return this.getCardTransactions(cardId).filter(tx => (tx.date || '').startsWith(prefix));
    },

    // 下次扣款日 = 未來（含今天）最近的 paymentDay；
    // 該期結帳日：扣款日在結帳日之後 → 同月結帳，否則為上個月結帳
    getNextPaymentInfo(card) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let payDate = new Date(today.getFullYear(), today.getMonth(), card.paymentDay);
      if (payDate < today) {
        payDate = new Date(today.getFullYear(), today.getMonth() + 1, card.paymentDay);
      }
      const stmtShift = card.paymentDay > card.statementDay ? 0 : -1;
      const stmtDate = new Date(payDate.getFullYear(), payDate.getMonth() + stmtShift, card.statementDay);
      return { stmtDate, payDate };
    },

    // ── Auto Card Bills ──
    getProcessedBills() {
      return loadCache(CACHE.autoBills) || [];
    },

    // 開 App 時處理信用卡自動扣款：
    // 1. 補扣最近 3 期內漏掉的扣款日（漏開 App 那天也會補），但只補「啟用補扣機制」之後的帳單，不回溯舊帳
    // 2. 先向雲端 auto_bills 登記 bill_key（UNIQUE）當鎖，兩台裝置同天開 App 也不會重複扣款
    // 3. 扣款交易帶 accountId，之後刪除/編輯會自動回沖帳戶餘額
    async processCardBills() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const processed = this.getProcessedBills();
      const cards = this.getCreditCards();

      let backfillFrom = loadCache(CACHE.billBackfillFrom);
      if (!backfillFrom) {
        backfillFrom = Utils.todayStr();
        saveCache(CACHE.billBackfillFrom, backfillFrom);
      }
      const [fy, fm, fd] = backfillFrom.split('-').map(Number);
      const fromDate = new Date(fy, fm - 1, fd);

      let newBills = 0;

      for (const card of cards) {
        if (!card.linkedAccountId) continue;
        for (let k = 2; k >= 0; k--) {
          const payDate = new Date(today.getFullYear(), today.getMonth() - k, card.paymentDay);
          if (payDate > today || payDate < fromDate) continue;

          const billKey = `${card.id}_${payDate.getFullYear()}_${payDate.getMonth()}`;
          if (processed.includes(billKey)) continue;

          const stmtShift = card.paymentDay > card.statementDay ? 0 : -1;
          const stmtDate = new Date(payDate.getFullYear(), payDate.getMonth() + stmtShift, card.statementDay);
          const billAmount = this.getCardBillForPeriod(card.id, stmtDate.getFullYear(), stmtDate.getMonth());
          if (billAmount <= 0) continue;

          let claimed = false;
          try {
            const res = await db.from('auto_bills').insert({ bill_key: billKey });
            if (res.error) {
              // 23505 = 對方裝置已處理這期 → 本機記下 key 即可；其他錯誤（如離線）下次開 App 再試
              if (res.error.code !== '23505') continue;
            } else {
              claimed = true;
            }
          } catch { continue; }

          processed.push(billKey);
          if (!claimed) continue;

          const payStr = `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, '0')}-${String(payDate.getDate()).padStart(2, '0')}`;
          this.addTransaction({
            amount: billAmount,
            type: 'expense',
            category: 'bill',
            description: `${card.name} 信用卡扣款`,
            date: payStr,
            userId: card.ownerId,
            walletType: 'personal',
            creditCardId: '',
            accountId: card.linkedAccountId,
            isAutoBill: true,
          });
          newBills++;
        }
      }

      saveCache(CACHE.autoBills, processed);
      return newBills;
    },

    // ── Stocks ──
    getStocks(scope) {
      const target = scope || 'personal';
      const all = loadCache(CACHE.stocks) || [];
      if (target === 'house_fund') {
        return all.filter(s => (s.assetScope || 'personal') === 'house_fund');
      }
      const me = this.getCurrentUser();
      return all.filter(s =>
        (s.assetScope || 'personal') === 'personal' && s.ownerId === me
      );
    },
    getAllStocks() {
      return loadCache(CACHE.stocks) || [];
    },
    addStock(stock) {
      const list = this.getAllStocks();
      stock.id = uid();
      const scope = stock.assetScope || 'personal';
      stock.assetScope = scope;
      stock.ownerId = scope === 'house_fund' ? 'house_fund' : this.getCurrentUser();
      stock.currentPrice = stock.avgCost || 0;
      stock.lastUpdated = null;
      list.push(stock);
      saveCache(CACHE.stocks, list);
      cloudWrite('stocks', 'insert', appStockToDb(stock));
      return stock;
    },
    updateStock(id, updates) {
      const list = this.getAllStocks();
      const idx = list.findIndex(s => s.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates };
        saveCache(CACHE.stocks, list);
        cloudWrite('stocks', 'update', appStockToDb(list[idx]), { id });
      }
    },
    deleteStock(id) {
      const list = this.getAllStocks().filter(s => s.id !== id);
      saveCache(CACHE.stocks, list);
      const txs = (loadCache(CACHE.stockTxs) || []).filter(t => t.stockId !== id);
      saveCache(CACHE.stockTxs, txs);
      cloudWrite('stock_transactions', 'delete', null, { stock_id: id });
      cloudWrite('stocks', 'delete', null, { id });
    },

    getStockTransactions(stockId) {
      return (loadCache(CACHE.stockTxs) || [])
        .filter(t => t.stockId === stockId)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    addStockTransaction(tx) {
      const txs = loadCache(CACHE.stockTxs) || [];
      tx.id = uid();
      tx.createdAt = new Date().toISOString();
      txs.unshift(tx);
      saveCache(CACHE.stockTxs, txs);
      cloudWrite('stock_transactions', 'insert', appStockTxToDb(tx));

      const stock = this.getAllStocks().find(s => s.id === tx.stockId);
      if (stock) {
        if (tx.type === 'buy') {
          const totalCost = stock.avgCost * stock.shares + tx.price * tx.shares;
          stock.shares += tx.shares;
          stock.avgCost = stock.shares > 0 ? totalCost / stock.shares : 0;
        } else {
          stock.shares -= tx.shares;
          if (stock.shares < 0) stock.shares = 0;
        }
        this.updateStock(stock.id, { shares: stock.shares, avgCost: stock.avgCost });
      }
      return tx;
    },

    getFinnhubKey() {
      return loadCache(CACHE.finnhubKey) || '';
    },
    setFinnhubKey(key) {
      saveCache(CACHE.finnhubKey, key);
      const settings = this.getSettings();
      settings.finnhubKey = key;
      this.saveSettings(settings, ['finnhubKey']);
    },

    getStockTotalsByCurrency(scope) {
      const stocks = this.getStocks(scope);
      return {
        tw: Utils.sumStocksMarketValueTw(stocks),
        usd: Utils.sumStocksMarketValueUsd(stocks),
      };
    },

    exportData() {
      return JSON.stringify({
        transactions: this.getTransactions(),
        creditCards: this.getCreditCards(),
        accounts: this.getAccounts(),
        settings: this.getSettings(),
        autoBills: this.getProcessedBills(),
        expenseCategories: getExpenseCategories(),
        incomeCategories: getIncomeCategories(),
        stocks: this.getAllStocks(),
        stockTransactions: loadCache(CACHE.stockTxs) || [],
      }, null, 2);
    },

    async importData(json) {
      try {
        const data = JSON.parse(json);
        // 格式防呆：欄位存在但型別不對就整個拒絕，避免把雲端資料清掉後寫入垃圾
        const listKeys = ['transactions', 'creditCards', 'accounts', 'autoBills', 'expenseCategories', 'incomeCategories'];
        for (const k of listKeys) {
          if (data[k] !== undefined && !Array.isArray(data[k])) return false;
        }
        if (data.settings !== undefined && (typeof data.settings !== 'object' || data.settings === null)) return false;
        if (data.transactions) {
          saveCache(CACHE.transactions, data.transactions);
          await db.from('transactions').delete().neq('id', '');
          const dbTxs = data.transactions.map(appTxToDb);
          for (let i = 0; i < dbTxs.length; i += 500) {
            await db.from('transactions').upsert(dbTxs.slice(i, i + 500));
          }
        }
        if (data.creditCards) {
          saveCache(CACHE.creditCards, data.creditCards);
          await db.from('credit_cards').delete().neq('id', '');
          if (data.creditCards.length > 0) {
            await db.from('credit_cards').upsert(data.creditCards.map(appCardToDb));
          }
        }
        if (data.accounts) {
          saveCache(CACHE.accounts, data.accounts);
          await db.from('accounts').delete().neq('id', '');
          if (data.accounts.length > 0) {
            await db.from('accounts').upsert(data.accounts.map(appAccToDb));
          }
        }
        if (data.settings) {
          saveCache(CACHE.settings, data.settings);
          await db.from('settings').upsert({ id: 'global', data: data.settings, updated_at: new Date().toISOString() });
        }
        if (data.autoBills) {
          saveCache(CACHE.autoBills, data.autoBills);
          await db.from('auto_bills').delete().neq('id', 0);
          if (data.autoBills.length > 0) {
            await db.from('auto_bills').upsert(data.autoBills.map(k => ({ bill_key: k })));
          }
        }
        if (data.expenseCategories) {
          saveCache(CACHE.expenseCats, data.expenseCategories);
          await db.from('categories').delete().eq('type', 'expense');
          await db.from('categories').insert(data.expenseCategories.map(c => ({ cat_id: c.id, icon: c.icon, name: c.name, type: 'expense' })));
        }
        if (data.incomeCategories) {
          saveCache(CACHE.incomeCats, data.incomeCategories);
          await db.from('categories').delete().eq('type', 'income');
          await db.from('categories').insert(data.incomeCategories.map(c => ({ cat_id: c.id, icon: c.icon, name: c.name, type: 'income' })));
        }
        return true;
      } catch (e) {
        console.error('Import error:', e);
        return false;
      }
    },
  };
})();
