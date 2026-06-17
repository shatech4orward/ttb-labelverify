import { Express, Request, Response } from "express";
import { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { verifyLabel, ApplicationData } from "./labelVerifier";
import { v4 as uuidv4 } from "uuid";

// Create uploads directory
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

/**
 * Simulate AI/OCR label text extraction from image.
 * In production, this would call Azure Computer Vision, Google Vision, or similar.
 * For this prototype, we use the application data + inject realistic label text.
 */
function simulateOCR(imagePath: string, applicationData?: ApplicationData): string {
  // Generate realistic label text based on application data provided
  const brand = applicationData?.brandName || "OLD TOM DISTILLERY";
  const classType = applicationData?.classType || "Kentucky Straight Bourbon Whiskey";
  const abv = applicationData?.alcoholContent || "45% Alc./Vol. (90 Proof)";
  const net = applicationData?.netContents || "750 mL";
  const nameAddr = applicationData?.nameAddress || "Old Tom Distillery, Bardstown, KY";
  const origin = applicationData?.countryOfOrigin || "";

  // Simulate a realistic label text that would come from OCR
  let text = `${brand}\n${classType}\n${abv}\n${net}\n`;
  if (nameAddr) text += `Bottled by ${nameAddr}\n`;
  if (origin) text += `Product of ${origin}\n`;

  // Always include the government warning
  text += `\nGOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.`;

  return text;
}

export function registerRoutes(httpServer: Server, app: Express) {
  // --- Upload & verify single label ---
  app.post("/api/verify", upload.single("label"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No label image provided" });
      }

      const applicationData: ApplicationData = {
        brandName: req.body.brandName || undefined,
        classType: req.body.classType || undefined,
        alcoholContent: req.body.alcoholContent || undefined,
        netContents: req.body.netContents || undefined,
        nameAddress: req.body.nameAddress || undefined,
        countryOfOrigin: req.body.countryOfOrigin || undefined,
        beverageType: req.body.beverageType || undefined,
      };

      // Create job record
      const job = storage.createJob({
        filename: req.file.filename,
        originalName: req.file.originalname,
        status: "processing",
        beverageType: applicationData.beverageType as any || null,
        batchId: req.body.batchId || null,
        overallResult: null,
        score: null,
        extractedFields: null,
        checkResults: null,
        notes: req.body.notes || null,
        agentNotes: null,
      });

      // Simulate processing delay (would be real OCR/AI call in production)
      const startTime = Date.now();

      // Extract text from label (simulated OCR)
      const labelText = simulateOCR(req.file.path, applicationData);

      // Run verification
      const result = verifyLabel(labelText, applicationData);

      const elapsed = Date.now() - startTime;
      // Ensure we meet the <5s requirement from stakeholder interview
      console.log(`Label verification completed in ${elapsed}ms`);

      // Update job
      const updatedJob = storage.updateJob(job.id, {
        status: "completed",
        overallResult: result.overallResult,
        score: result.score,
        beverageType: result.beverageType,
        extractedFields: JSON.stringify(result.fields),
        checkResults: JSON.stringify({
          issues: result.issues,
          warnings: result.warnings,
          extractedText: result.extractedText,
        }),
        completedAt: Date.now(),
      });

      res.json({ job: updatedJob, result });
    } catch (err: any) {
      console.error("Verify error:", err);
      res.status(500).json({ error: err.message || "Verification failed" });
    }
  });

  // --- Batch upload ---
  app.post("/api/batch", upload.array("labels", 300), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No label images provided" });
      }

      const batchId = uuidv4();
      const batchName = req.body.batchName || `Batch ${new Date().toLocaleDateString()} (${files.length} labels)`;

      const batch = storage.createBatch({
        id: batchId,
        name: batchName,
        totalCount: files.length,
        status: "processing",
      });

      // Process all labels (synchronously for prototype; async queue in production)
      let passCount = 0, failCount = 0, warningCount = 0;

      for (const file of files) {
        const applicationData: ApplicationData = {
          brandName: req.body.brandName || undefined,
          classType: req.body.classType || undefined,
          alcoholContent: req.body.alcoholContent || undefined,
          netContents: req.body.netContents || undefined,
          beverageType: req.body.beverageType || undefined,
        };

        const job = storage.createJob({
          filename: file.filename,
          originalName: file.originalname,
          status: "processing",
          beverageType: applicationData.beverageType as any || null,
          batchId,
          overallResult: null,
          score: null,
          extractedFields: null,
          checkResults: null,
          notes: null,
          agentNotes: null,
        });

        const labelText = simulateOCR(file.path, applicationData);
        const result = verifyLabel(labelText, applicationData);

        storage.updateJob(job.id, {
          status: "completed",
          overallResult: result.overallResult,
          score: result.score,
          beverageType: result.beverageType,
          extractedFields: JSON.stringify(result.fields),
          checkResults: JSON.stringify({ issues: result.issues, warnings: result.warnings }),
          completedAt: Date.now(),
        });

        if (result.overallResult === "pass") passCount++;
        else if (result.overallResult === "fail") failCount++;
        else warningCount++;
      }

      const updatedBatch = storage.updateBatch(batchId, {
        completedCount: files.length,
        passCount,
        failCount,
        warningCount,
        status: "completed",
      });

      res.json({ batch: updatedBatch });
    } catch (err: any) {
      console.error("Batch error:", err);
      res.status(500).json({ error: err.message || "Batch processing failed" });
    }
  });

  // --- Get all jobs ---
  app.get("/api/jobs", (_req: Request, res: Response) => {
    const jobs = storage.getAllJobs();
    res.json(jobs);
  });

  // --- Get single job ---
  app.get("/api/jobs/:id", (req: Request, res: Response) => {
    const job = storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  // --- Update agent notes on a job ---
  app.patch("/api/jobs/:id", (req: Request, res: Response) => {
    const job = storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    const updated = storage.updateJob(Number(req.params.id), {
      agentNotes: req.body.agentNotes,
      overallResult: req.body.overallResult || job.overallResult,
    });
    res.json(updated);
  });

  // --- Delete job ---
  app.delete("/api/jobs/:id", (req: Request, res: Response) => {
    storage.deleteJob(Number(req.params.id));
    res.json({ success: true });
  });

  // --- Get all batches ---
  app.get("/api/batches", (_req: Request, res: Response) => {
    const allBatches = storage.getAllBatches();
    res.json(allBatches);
  });

  // --- Get jobs in a batch ---
  app.get("/api/batches/:id/jobs", (req: Request, res: Response) => {
    const jobs = storage.getJobsByBatch(req.params.id);
    res.json(jobs);
  });

  // --- Dashboard stats ---
  app.get("/api/stats", (_req: Request, res: Response) => {
    const jobs = storage.getAllJobs().filter(j => j.status === "completed");
    const total = jobs.length;
    const pass = jobs.filter(j => j.overallResult === "pass").length;
    const fail = jobs.filter(j => j.overallResult === "fail").length;
    const warning = jobs.filter(j => j.overallResult === "warning").length;
    const avgScore = total > 0 ? Math.round(jobs.reduce((sum, j) => sum + (j.score || 0), 0) / total) : 0;
    res.json({ total, pass, fail, warning, avgScore });
  });
}
