-- Found Sock helpdesk schema. Applied manually:
--   local dev:  npx wrangler d1 execute foundsock-helpdesk --local --file=db/schema.sql
--   production: paste into Cloudflare dashboard -> D1 -> foundsock-helpdesk -> Console
-- MIGRATION 2026-07 (ops): existing databases need
--   ALTER TABLE tickets ADD COLUMN closed_at TEXT;
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  reply_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  machine_type TEXT, machine_number TEXT,
  card_type TEXT, card_last4 TEXT, loyalty_card TEXT,
  issue_date TEXT, issue_time TEXT, cost TEXT,
  photo_key TEXT,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1
  , closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_status_activity ON tickets(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(customer_email);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  from_email TEXT,
  email_message_id TEXT,
  attachments TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id, created_at);

-- day + hour are bucketed in America/New_York at insert time (see db.ts).
-- MIGRATION 2026-07 (analytics hour): existing databases need
--   ALTER TABLE pageviews ADD COLUMN hour INTEGER;
CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER,
  path TEXT NOT NULL,
  referrer_host TEXT,
  country TEXT,
  device TEXT
);
CREATE INDEX IF NOT EXISTS idx_pageviews_day ON pageviews(day);

CREATE TABLE IF NOT EXISTS ai_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  trigger_message_id INTEGER,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested',
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_ticket ON ai_drafts(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0
);
