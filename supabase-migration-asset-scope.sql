-- Pinchi：買房基金（共同資產）雲端同步 — 在 Supabase SQL Editor 一次執行
-- 兩人登入同一個 Supabase 專案，開 app 時會 syncFromCloud，資料會一致

-- ── 1. 帳戶 / 股票：標記 personal | house_fund（必做）──
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS asset_scope TEXT DEFAULT 'personal';

ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS asset_scope TEXT DEFAULT 'personal';

-- 若先前已用 owner_id = house_fund 建立，補標記（可選但建議）
UPDATE accounts SET asset_scope = 'house_fund' WHERE owner_id = 'house_fund';
UPDATE stocks SET asset_scope = 'house_fund' WHERE owner_id = 'house_fund';

-- ── 2. 交易：允許買房基金帳本 + 連動帳戶（必做，否則記帳寫入會失敗）──
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id TEXT DEFAULT '';

-- 放寬 wallet_type（舊 schema 可能只允許 shared / personal）
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_wallet_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_wallet_type_check
  CHECK (wallet_type IN ('shared', 'personal', 'house_fund'));

-- ── 3. 股票表（若尚未建立才需要；已存在可略過錯誤）──
CREATE TABLE IF NOT EXISTS stocks (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT DEFAULT '',
  market TEXT DEFAULT 'us',
  shares NUMERIC DEFAULT 0,
  avg_cost NUMERIC DEFAULT 0,
  current_price NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ,
  owner_id TEXT NOT NULL,
  asset_scope TEXT DEFAULT 'personal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id TEXT PRIMARY KEY,
  stock_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  shares NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON stocks;
DROP POLICY IF EXISTS "Allow all" ON stock_transactions;
CREATE POLICY "Allow all" ON stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON stock_transactions FOR ALL USING (true) WITH CHECK (true);
