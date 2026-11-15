CREATE TABLE jobs_email_migration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_site TEXT NOT NULL CHECK (source_site IN ('saramin','jobkorea','incruit','jasoseol','linkareer')),
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
  match_status TEXT,
  UNIQUE (source_site, canonical_url),
  UNIQUE (source_site, source_job_id)
);
INSERT INTO jobs_email_migration (id,source_site,source_job_id,canonical_url,company_name,job_title,industry,career_requirement,education_requirement,employment_type,work_location,salary,deadline,published_at,collected_at,is_read,is_favorite,is_deleted,deleted_at,restored_at,created_at,updated_at)
SELECT id,source_site,source_job_id,canonical_url,company_name,job_title,industry,career_requirement,education_requirement,employment_type,work_location,salary,deadline,published_at,collected_at,is_read,is_favorite,is_deleted,deleted_at,restored_at,created_at,updated_at FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_email_migration RENAME TO jobs;
CREATE INDEX idx_jobs_active_published ON jobs(is_deleted, published_at DESC, id DESC);
CREATE INDEX idx_jobs_deleted ON jobs(is_deleted, deleted_at DESC);
CREATE INDEX idx_jobs_read_favorite ON jobs(is_read, is_favorite, is_deleted);
CREATE INDEX idx_jobs_source ON jobs(source_site, is_deleted);
CREATE TABLE email_ingest_messages (
  message_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);