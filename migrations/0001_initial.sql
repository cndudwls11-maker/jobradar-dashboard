PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_site TEXT NOT NULL CHECK (source_site IN ('saramin','jobkorea','incruit','jasoseol')),
  source_job_id TEXT,
  canonical_url TEXT NOT NULL,
  company_name TEXT,
  job_title TEXT,
  industry TEXT,
  career_requirement TEXT,
  education_requirement TEXT,
  employment_type TEXT,
  work_location TEXT,
  salary TEXT,
  deadline TEXT,
  published_at TEXT,
  collected_at TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  deleted_at TEXT,
  restored_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (source_site, canonical_url),
  UNIQUE (source_site, source_job_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_active_published ON jobs(is_deleted, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_deleted ON jobs(is_deleted, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_read_favorite ON jobs(is_read, is_favorite, is_deleted);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source_site, is_deleted);

CREATE TABLE IF NOT EXISTS preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  industries_json TEXT NOT NULL DEFAULT '[]',
  companies_json TEXT NOT NULL DEFAULT '[]',
  roles_json TEXT NOT NULL DEFAULT '[]',
  career_level TEXT NOT NULL DEFAULT '신입' CHECK (career_level IN ('신입','경력','신입/경력','전체')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO preferences(id) VALUES (1);

CREATE TABLE IF NOT EXISTS collection_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','completed','partial','failed')),
  new_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  deleted_excluded_count INTEGER NOT NULL DEFAULT 0,
  excluded_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_collection_runs_started ON collection_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS collection_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES collection_runs(id) ON DELETE CASCADE,
  source_site TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected','unconnected','failed')),
  discovered_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  deleted_excluded_count INTEGER NOT NULL DEFAULT 0,
  excluded_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(run_id, source_site)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);