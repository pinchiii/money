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
  };

  const DEFAULT_SETTINGS = {
    users: [
      { id: 'user1', name: '我', emoji: '🧑', pin: '' },
      { id: 'user2', name: '另一半', emoji: '💕', pin: '' },
    ],
    currency: 'NT$',
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
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
      color: row.color || '#6C5CE7',
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
      color: card.color || '#6C5CE7',
    };
  }

  function dbAccToApp(row) {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon || '🏦',
      balance: Number(row.balance || 0),
      ownerId: row.owner_id,
    };
  }

  function appAccToDb(acc) {
    return {
      id: acc.id,
      name: acc.name,
      icon: acc.icon || '🏦',
      balance: acc.balance || 0,
      owner_id: acc.ownerId,
    };
  }

  function dbCatToApp(row) {
    return { id: row.cat_id, icon: row.icon, name: row.name };
  }

  // ── Sync from Supabase on startup ──
  async function syncFromCloud() {
    try {
      const [txRes, cardRes, accRes, settRes, catRes, billRes] = await Promise.all([
        db.from('transactions').select('*').order('created_at', { ascending: false }),
        db.from('credit_cards').select('*'),
        db.from('accounts').select('*'),
        db.from('settings').select('*').eq('id', 'global').single(),
        db.from('categories').select('*'),
        db.from('auto_bills').select('*'),
      ]);

      if (txRes.data) {
        saveCache(CACHE.transactions, txRes.data.map(dbTxToApp));
      }
      if (cardRes.data) {
        saveCache(CACHE.creditCards, cardRes.data.map(dbCardToApp));
      }
      if (accRes.data) {
        saveCache(CACHE.accounts, accRes.data.map(dbAccToApp));
      }
      if (settRes.data) {
        saveCache(CACHE.settings, settRes.data.data);
      }
      if (catRes.data) {
        const expCats = catRes.data.filter(c => c.type === 'expense').map(dbCatToApp);
        const incCats = catRes.data.filter(c => c.type === 'income').map(dbCatToApp);
        if (expCats.length > 0) saveCache(CACHE.expenseCats, expCats);
        if (incCats.length > 0) saveCache(CACHE.incomeCats, incCats);
      }
      if (billRes.data) {
        saveCache(CACHE.autoBills, billRes.data.map(b => b.bill_key));
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

    db.from('categories').insert({ cat_id: cat.id, icon: cat.icon, name: cat.name, type }).then();
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
    db.from('categories').update(dbUpdates).eq('cat_id', id).eq('type', type).then();
    return cats;
  }

  function deleteCategory(type, id) {
    let cats = type === 'income' ? getIncomeCategories() : getExpenseCategories();
    cats = cats.filter(c => c.id !== id);
    if (type === 'income') saveCache(CACHE.incomeCats, cats);
    else saveCache(CACHE.expenseCats, cats);

    db.from('categories').delete().eq('cat_id', id).eq('type', type).then();
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
    saveSettings(s) {
      saveCache(CACHE.settings, s);
      db.from('settings').upsert({ id: 'global', data: s, updated_at: new Date().toISOString() }).then();
    },

    // ── Accounts ──
    getAccounts() {
      return loadCache(CACHE.accounts) || [];
    },
    getMyAccounts() {
      const me = this.getCurrentUser();
      return this.getAccounts().filter(a => a.ownerId === me);
    },
    addAccount(account) {
      const list = this.getAccounts();
      account.id = uid();
      list.push(account);
      saveCache(CACHE.accounts, list);
      db.from('accounts').insert(appAccToDb(account)).then();
      return account;
    },
    updateAccount(id, updates) {
      const list = this.getAccounts();
      const idx = list.findIndex(a => a.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates };
        saveCache(CACHE.accounts, list);
        db.from('accounts').update(appAccToDb(list[idx])).eq('id', id).then();
      }
    },
    deleteAccount(id) {
      const list = this.getAccounts().filter(a => a.id !== id);
      saveCache(CACHE.accounts, list);
      db.from('accounts').delete().eq('id', id).then();
    },
    adjustAccountBalance(id, delta) {
      const list = this.getAccounts();
      const idx = list.findIndex(a => a.id === id);
      if (idx >= 0) {
        list[idx].balance = (list[idx].balance || 0) + delta;
        saveCache(CACHE.accounts, list);
        db.from('accounts').update({ balance: list[idx].balance }).eq('id', id).then();
      }
    },

    // ── Transactions ──
    getTransactions() {
      return loadCache(CACHE.transactions) || [];
    },

    getVisibleTransactions() {
      const me = this.getCurrentUser();
      return this.getTransactions().filter(tx =>
        tx.walletType === 'shared' || tx.userId === me
      );
    },

    getVisibleTransactionsForMonth(year, month) {
      return this.getVisibleTransactions().filter(tx => {
        const d = new Date(tx.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
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

    addTransaction(tx) {
      const list = this.getTransactions();
      tx.id = uid();
      tx.createdAt = new Date().toISOString();
      list.unshift(tx);
      saveCache(CACHE.transactions, list);
      db.from('transactions').insert(appTxToDb(tx)).then();
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
      db.from('transactions').insert(dbRows).then();
      return txs.length;
    },

    updateTransaction(id, updates) {
      const list = this.getTransactions();
      const idx = list.findIndex(t => t.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates };
        saveCache(CACHE.transactions, list);
        db.from('transactions').update(appTxToDb(list[idx])).eq('id', id).then();
      }
    },

    deleteTransaction(id) {
      const list = this.getTransactions().filter(t => t.id !== id);
      saveCache(CACHE.transactions, list);
      db.from('transactions').delete().eq('id', id).then();
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
      db.from('credit_cards').insert(appCardToDb(card)).then();
      return card;
    },

    updateCreditCard(id, updates) {
      const list = this.getCreditCards();
      const idx = list.findIndex(c => c.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates };
        saveCache(CACHE.creditCards, list);
        db.from('credit_cards').update(appCardToDb(list[idx])).eq('id', id).then();
      }
    },

    deleteCreditCard(id) {
      const list = this.getCreditCards().filter(c => c.id !== id);
      saveCache(CACHE.creditCards, list);
      db.from('credit_cards').delete().eq('id', id).then();
    },

    getCardUnpaidAmount(cardId) {
      const card = this.getCreditCards().find(c => c.id === cardId);
      if (!card) return 0;
      const today = new Date();
      const txs = this.getTransactions().filter(tx => {
        if (tx.creditCardId !== cardId || tx.type !== 'expense') return false;
        const txDate = new Date(tx.date);
        const stmtDay = card.statementDay;
        let cutoff;
        if (today.getDate() > stmtDay) {
          cutoff = new Date(today.getFullYear(), today.getMonth(), stmtDay + 1);
        } else {
          cutoff = new Date(today.getFullYear(), today.getMonth() - 1, stmtDay + 1);
        }
        return txDate >= cutoff;
      });
      return txs.reduce((sum, tx) => sum + tx.amount, 0);
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
      return this.getCardTransactions(cardId).filter(tx => {
        const d = new Date(tx.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
    },

    getNextPaymentInfo(card) {
      const today = new Date();
      const stmtDay = card.statementDay;
      const payDay = card.paymentDay;
      let stmtDate, payDate;

      if (today.getDate() <= stmtDay) {
        stmtDate = new Date(today.getFullYear(), today.getMonth(), stmtDay);
        payDate = new Date(today.getFullYear(), today.getMonth(), payDay);
        if (payDay <= stmtDay) {
          payDate = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
        }
      } else {
        stmtDate = new Date(today.getFullYear(), today.getMonth() + 1, stmtDay);
        payDate = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
        if (payDay <= stmtDay) {
          payDate = new Date(today.getFullYear(), today.getMonth() + 2, payDay);
        }
      }
      return { stmtDate, payDate };
    },

    // ── Auto Card Bills ──
    getProcessedBills() {
      return loadCache(CACHE.autoBills) || [];
    },

    processCardBills() {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const processed = this.getProcessedBills();
      const cards = this.getCreditCards();
      let newBills = 0;

      cards.forEach(card => {
        if (!card.linkedAccountId) return;
        const payDay = card.paymentDay;
        if (today.getDate() !== payDay) return;

        const billKey = `${card.id}_${today.getFullYear()}_${today.getMonth()}`;
        if (processed.includes(billKey)) return;

        const info = this.getNextPaymentInfo(card);
        const stmtMonth = info.stmtDate.getMonth();
        const stmtYear = info.stmtDate.getFullYear();
        const billAmount = this.getCardBillForPeriod(card.id, stmtYear, stmtMonth);
        if (billAmount <= 0) return;

        this.adjustAccountBalance(card.linkedAccountId, -billAmount);

        this.addTransaction({
          amount: billAmount,
          type: 'expense',
          category: 'bill',
          description: `${card.name} 信用卡扣款`,
          date: todayStr,
          userId: card.ownerId,
          walletType: 'personal',
          creditCardId: '',
          isAutoBill: true,
        });

        processed.push(billKey);
        newBills++;
      });

      if (newBills > 0) {
        saveCache(CACHE.autoBills, processed);
        processed.slice(-newBills).forEach(billKey => {
          db.from('auto_bills').insert({ bill_key: billKey }).then();
        });
      }
      return newBills;
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
      }, null, 2);
    },

    async importData(json) {
      try {
        const data = JSON.parse(json);
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
