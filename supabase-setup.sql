-- Pinchi Supabase Schema Setup
-- Run this in your Supabase Dashboard > SQL Editor

-- Transactions table
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  note TEXT DEFAULT '',
  date DATE NOT NULL,
  user_id TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('shared', 'personal')),
  credit_card_id TEXT DEFAULT '',
  is_auto_bill BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit cards table
CREATE TABLE credit_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_four_digits TEXT DEFAULT '',
  owner_id TEXT NOT NULL,
  statement_day INTEGER NOT NULL,
  payment_day INTEGER NOT NULL,
  linked_account_id TEXT DEFAULT '',
  color TEXT DEFAULT '#6C5CE7',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏦',
  balance NUMERIC DEFAULT 0,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table (single row, keyed by 'global')
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  cat_id TEXT NOT NULL,
  icon TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cat_id, type)
);

-- Auto-processed bills tracker
CREATE TABLE auto_bills (
  id SERIAL PRIMARY KEY,
  bill_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for simplicity (two-person shared app)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_bills ENABLE ROW LEVEL SECURITY;

-- Allow full access with anon key
CREATE POLICY "Allow all" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON credit_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON auto_bills FOR ALL USING (true) WITH CHECK (true);

-- Insert default settings
INSERT INTO settings (id, data) VALUES ('global', '{
  "users": [
    {"id": "user1", "name": "我", "emoji": "🧑", "pin": ""},
    {"id": "user2", "name": "另一半", "emoji": "💕", "pin": ""}
  ],
  "currency": "NT$"
}'::jsonb);

-- Insert default expense categories
INSERT INTO categories (cat_id, icon, name, type) VALUES
  ('food', '🍔', '飲食', 'expense'),
  ('entertainment', '🎮', '娛樂', 'expense'),
  ('living', '🏠', '生活', 'expense'),
  ('other', '📌', '其他', 'expense');

-- Insert default income categories
INSERT INTO categories (cat_id, icon, name, type) VALUES
  ('salary', '💰', '薪水', 'income'),
  ('bonus', '🎉', '獎金', 'income'),
  ('investment', '📈', '投資', 'income'),
  ('side', '💼', '副業', 'income'),
  ('refund', '🔄', '退款', 'income'),
  ('other_income', '💵', '其他', 'income');
