import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const verificationJobs = sqliteTable("verification_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  beverageType: text("beverage_type"), // distilled_spirits | wine | beer
  overallResult: text("overall_result"), // pass | fail | warning
  score: real("score"),
  extractedFields: text("extracted_fields"), // JSON
  checkResults: text("check_results"), // JSON
  notes: text("notes"),
  agentNotes: text("agent_notes"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  completedAt: integer("completed_at"),
  batchId: text("batch_id"),
});

export const insertVerificationJobSchema = createInsertSchema(verificationJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertVerificationJob = z.infer<typeof insertVerificationJobSchema>;
export type VerificationJob = typeof verificationJobs.$inferSelect;

export const batches = sqliteTable("batches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  totalCount: integer("total_count").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  passCount: integer("pass_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  status: text("status").notNull().default("processing"), // processing | completed
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertBatchSchema = createInsertSchema(batches).omit({
  completedCount: true,
  passCount: true,
  failCount: true,
  warningCount: true,
  createdAt: true,
});

export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batches.$inferSelect;
