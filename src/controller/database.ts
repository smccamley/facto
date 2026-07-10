import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ControllerDatabase = DatabaseSync;

export const openControllerDatabase = (databasePath: string) => {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      git_ref TEXT NOT NULL,
      app_path TEXT NOT NULL,
      profile TEXT NOT NULL,
      submit TEXT NOT NULL,
      checks_json TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step TEXT,
      trigger_source TEXT NOT NULL,
      worker_name TEXT,
      commit_sha TEXT,
      artifact_path TEXT,
      error_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      leased_at TEXT,
      last_heartbeat_at TEXT
    );

    CREATE TABLE IF NOT EXISTS steps (
      job_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      exit_code INTEGER,
      summary TEXT,
      PRIMARY KEY (job_id, name),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      step TEXT,
      line TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      size_bytes INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS jobs_created_at_index ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS logs_job_id_index ON logs(job_id, id DESC);
  `);

  return database;
};
