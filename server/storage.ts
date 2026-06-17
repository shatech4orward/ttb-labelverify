import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, isNull } from "drizzle-orm";
import { verificationJobs, batches, type VerificationJob, type Batch, type InsertVerificationJob, type InsertBatch } from "@shared/schema";

const sqlite = new Database("data.db");
export const db = drizzle(sqlite);

// Run migrations
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS verification_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    beverage_type TEXT,
    overall_result TEXT,
    score REAL,
    extracted_fields TEXT,
    check_results TEXT,
    notes TEXT,
    agent_notes TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    batch_id TEXT
  );
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    pass_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing',
    created_at INTEGER NOT NULL
  );
`);

export interface IStorage {
  createJob(data: InsertVerificationJob): VerificationJob;
  getJob(id: number): VerificationJob | undefined;
  getAllJobs(): VerificationJob[];
  updateJob(id: number, updates: Partial<VerificationJob>): VerificationJob | undefined;
  deleteJob(id: number): void;
  getJobsByBatch(batchId: string): VerificationJob[];

  createBatch(data: InsertBatch): Batch;
  getBatch(id: string): Batch | undefined;
  getAllBatches(): Batch[];
  updateBatch(id: string, updates: Partial<Batch>): Batch | undefined;
}

export class SQLiteStorage implements IStorage {
  createJob(data: InsertVerificationJob): VerificationJob {
    const now = Date.now();
    return db.insert(verificationJobs).values({ ...data, createdAt: now }).returning().get();
  }

  getJob(id: number): VerificationJob | undefined {
    return db.select().from(verificationJobs).where(eq(verificationJobs.id, id)).get();
  }

  getAllJobs(): VerificationJob[] {
    return db.select().from(verificationJobs).orderBy(desc(verificationJobs.createdAt)).all();
  }

  updateJob(id: number, updates: Partial<VerificationJob>): VerificationJob | undefined {
    return db.update(verificationJobs).set(updates).where(eq(verificationJobs.id, id)).returning().get();
  }

  deleteJob(id: number): void {
    db.delete(verificationJobs).where(eq(verificationJobs.id, id)).run();
  }

  getJobsByBatch(batchId: string): VerificationJob[] {
    return db.select().from(verificationJobs).where(eq(verificationJobs.batchId, batchId)).all();
  }

  createBatch(data: InsertBatch): Batch {
    const now = Date.now();
    return db.insert(batches).values({ ...data, createdAt: now, completedCount: 0, passCount: 0, failCount: 0, warningCount: 0 }).returning().get();
  }

  getBatch(id: string): Batch | undefined {
    return db.select().from(batches).where(eq(batches.id, id)).get();
  }

  getAllBatches(): Batch[] {
    return db.select().from(batches).orderBy(desc(batches.createdAt)).all();
  }

  updateBatch(id: string, updates: Partial<Batch>): Batch | undefined {
    return db.update(batches).set(updates).where(eq(batches.id, id)).returning().get();
  }
}

export const storage = new SQLiteStorage();
