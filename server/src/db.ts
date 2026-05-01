import Database from "better-sqlite3";
import { dbPath, ensureDataFolders } from "./paths";

export function createDatabase(): Database.Database {
  ensureDataFolders();
  const db: Database.Database = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS setups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS mistake_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS capital_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      trade_id INTEGER,
      exit_id INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      entry_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      stop_loss REAL NOT NULL,
      risk_percentage REAL NOT NULL,
      planned_risk_amount REAL NOT NULL,
      setup_id INTEGER,
      entry_reason TEXT NOT NULL DEFAULT '',
      emotional_state TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 3,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (setup_id) REFERENCES setups(id)
    );
    CREATE TABLE IF NOT EXISTS trade_checklist_responses (
      trade_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      checked INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (trade_id, item_id),
      FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES checklist_items(id)
    );
    CREATE TABLE IF NOT EXISTS trade_exits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      exit_date TEXT NOT NULL,
      exit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      emotional_state TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      pnl REAL NOT NULL,
      r_multiple REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      exit_id INTEGER,
      type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
      FOREIGN KEY (exit_id) REFERENCES trade_exits(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS trade_reviews (
      trade_id INTEGER PRIMARY KEY,
      followed_plan INTEGER NOT NULL DEFAULT 1,
      rule_score INTEGER NOT NULL DEFAULT 5,
      discipline_score INTEGER NOT NULL DEFAULT 5,
      went_well TEXT NOT NULL DEFAULT '',
      went_wrong TEXT NOT NULL DEFAULT '',
      lesson TEXT NOT NULL DEFAULT '',
      repeat_next_time TEXT NOT NULL DEFAULT '',
      avoid_next_time TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS trade_mistakes (
      trade_id INTEGER NOT NULL,
      mistake_id INTEGER NOT NULL,
      PRIMARY KEY (trade_id, mistake_id),
      FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
      FOREIGN KEY (mistake_id) REFERENCES mistake_tags(id)
    );
  `);
}

function seed(db: Database.Database): void {
  const settings: readonly [string, string][] = [
    ["startingCapital", "550000"],
    ["defaultMarket", "India"],
    ["defaultDirection", "Buy"],
    ["defaultRiskMode", "percentage"],
    ["defaultRiskPercentage", "1"]
  ];
  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  settings.forEach(([key, value]: [string, string]) => insertSetting.run(key, value));
  ["Breakout", "Pullback", "Continuation"].forEach((name: string) => {
    db.prepare("INSERT OR IGNORE INTO setups (name) VALUES (?)").run(name);
  });
  ["Trend aligned", "Valid setup", "Stop defined", "Risk acceptable", "No chase"].forEach((label: string) => {
    db.prepare("INSERT OR IGNORE INTO checklist_items (label) VALUES (?)").run(label);
  });
  ["Chased entry", "Exited early", "Moved stop", "Oversized", "Ignored market"].forEach((label: string) => {
    db.prepare("INSERT OR IGNORE INTO mistake_tags (label) VALUES (?)").run(label);
  });
}
