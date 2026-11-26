// SQLite-Datenbank: Schema, Migrationen und Hilfsfunktionen
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'bot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const now = () => Date.now();

db.exec(`
CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS templates (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS permission_roles (
  guild_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, grp, role_id)
);

CREATE TABLE IF NOT EXISTS command_rules (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  mode TEXT NOT NULL,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS panels (
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, type, ref)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  host_id TEXT NOT NULL,
  cohost_id TEXT,
  description TEXT,
  server_code TEXT,
  requirements TEXT,
  min_players INTEGER DEFAULT 0,
  rules TEXT,
  image_url TEXT,
  status TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  message_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  duration INTEGER,
  peak_players INTEGER DEFAULT 0,
  max_players INTEGER,
  samples_sum INTEGER DEFAULT 0,
  samples_count INTEGER DEFAULT 0,
  last_players INTEGER,
  last_update INTEGER,
  end_reason TEXT,
  ended_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_guild ON sessions(guild_id, status);

CREATE TABLE IF NOT EXISTS session_hosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hosts_user ON session_hosts(guild_id, user_id);

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  user_id TEXT,
  data TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_team_stats (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  team TEXT NOT NULL,
  sum INTEGER NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, team)
);

CREATE TABLE IF NOT EXISTS queue_entries (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS queue_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  by_id TEXT,
  wait_ms INTEGER,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS erlc_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  command TEXT NOT NULL,
  success INTEGER NOT NULL,
  error TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  emoji TEXT,
  color INTEGER,
  role_id TEXT,
  leader_id TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (guild_id, short)
);

CREATE TABLE IF NOT EXISTS department_ranks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  role_id TEXT,
  is_leadership INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS department_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  rank_id INTEGER REFERENCES department_ranks(id) ON DELETE SET NULL,
  callsign TEXT,
  joined_at INTEGER NOT NULL,
  last_promotion INTEGER,
  UNIQUE (department_id, user_id)
);

CREATE TABLE IF NOT EXISTS department_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_rank TEXT,
  to_rank TEXT,
  by_id TEXT,
  reason TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS department_trainings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at INTEGER,
  channel_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'offen',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS training_attendance (
  training_id INTEGER NOT NULL REFERENCES department_trainings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (training_id, user_id)
);

CREATE TABLE IF NOT EXISTS modmail_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  claimed_by TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  closed_by TEXT,
  close_reason TEXT,
  first_response_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mm_user ON modmail_conversations(guild_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_mm_channel ON modmail_conversations(channel_id);

CREATE TABLE IF NOT EXISTS modmail_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES modmail_conversations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  content TEXT,
  attachments TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS modmail_staff (
  conversation_id INTEGER NOT NULL REFERENCES modmail_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  answers TEXT NOT NULL,
  status TEXT NOT NULL,
  reviewer_id TEXT,
  reason TEXT,
  channel_id TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_app_user ON applications(guild_id, user_id);

CREATE TABLE IF NOT EXISTS application_drafts (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  answers TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS application_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  note TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  duration INTEGER,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mod_user ON moderation(guild_id, user_id);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_ranks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS staff_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  by_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_role TEXT,
  to_role TEXT,
  by_id TEXT,
  reason TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_duty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_duty_user ON staff_duty(guild_id, user_id);

CREATE TABLE IF NOT EXISTS staff_activity (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, type)
);

CREATE TABLE IF NOT EXISTS verification (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  role_id TEXT,
  image_url TEXT,
  color INTEGER,
  author_id TEXT NOT NULL,
  send_at INTEGER,
  sent_at INTEGER,
  message_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  channel_id TEXT,
  message_id TEXT,
  staff_id TEXT,
  staff_reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS suggestion_votes (
  suggestion_id INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  vote INTEGER NOT NULL,
  PRIMARY KEY (suggestion_id, user_id)
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  multi INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  message_id TEXT,
  ends_at INTEGER,
  ended INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id, option_index)
);

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winners INTEGER NOT NULL,
  required_role TEXT,
  channel_id TEXT,
  message_id TEXT,
  ends_at INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0,
  winner_ids TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);

CREATE TABLE IF NOT EXISTS role_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  channel_id TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS role_panel_roles (
  panel_id INTEGER NOT NULL REFERENCES role_panels(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT,
  PRIMARY KEY (panel_id, role_id)
);

CREATE TABLE IF NOT EXISTS levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  last_xp_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS level_roles (
  guild_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, level)
);

CREATE TABLE IF NOT EXISTS custom_commands (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name)
);

CREATE TABLE IF NOT EXISTS info_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  channel_id TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  user_id TEXT,
  target_id TEXT,
  details TEXT,
  at INTEGER NOT NULL
);
`);

// Kleine Helfer
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const tx = (fn) => db.transaction(fn);

function ensureGuild(guildId) {
  run('INSERT OR IGNORE INTO guilds (guild_id, created_at) VALUES (?, ?)', guildId, now());
}

function audit(guildId, type, userId, targetId, details) {
  run('INSERT INTO audit_log (guild_id, type, user_id, target_id, details, at) VALUES (?,?,?,?,?,?)',
    guildId, type, userId || null, targetId || null, details ? JSON.stringify(details) : null, now());
}

function bumpActivity(guildId, userId, type, n = 1) {
  run(`INSERT INTO staff_activity (guild_id, user_id, type, count) VALUES (?,?,?,?)
       ON CONFLICT(guild_id, user_id, type) DO UPDATE SET count = count + excluded.count`, guildId, userId, type, n);
}

module.exports = { db, one, all, run, tx, now, ensureGuild, audit, bumpActivity };
