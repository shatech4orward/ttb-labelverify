import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Layers, Upload, CheckCircle2, XCircle, AlertTriangle,
  Loader2, FileImage, FileSpreadsheet, Download, ArrowRight,
  ArrowLeft, Link2, Link2Off, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { store, BatchRecord } from "@/lib/store";
import {
  parseCSV, matchPairs, generateBatchCSVTemplate,
  CSVRow, MatchedPair, UnmatchedImage,
} from "@/lib/csvParser";

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Upload CSV" },
  { n: 2, label: "Upload Labels" },
  { n: 3, label: "Review Matches" },
  { n: 4, label: "Results" },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors
              ${current === s.n ? "border-primary bg-primary text-primary-foreground"
                : current > s.n ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground"}`}>
              {current > s.n ? <CheckCircle2 size={14} /> : s.n}
            </div>
            <span className={`text-[10px] mt-1 font-medium whitespace-nowrap
              ${current === s.n ? "text-primary" : current > s.n ? "text-primary/70" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1 mb-4 rounded transition-colors
              ${current > s.n ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Match status badge ────────────────────────────────────────────────────────

function MatchBadge({ pair }: { pair: MatchedPair }) {
  if (pair.matchStatus === "matched") {
    const label = pair.matchMethod === "label_file" ? "Exact" : "Fuzzy";
    return (
      <Badge className="border-0 text-[10px] h-4 px-1.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1">
        <Link2 size={9} />{label}
      </Badge>
    );
  }
  return (
    <Badge className="border-0 text-[10px] h-4 px-1.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1">
      <Link2Off size={9} />No match
    </Badge>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BatchVerify() {
  const { toast } = useToast();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [batchName, setBatchName] = useState("");

  // Step 1
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvFilename, setCsvFilename] = useState("");

  // Step 2
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imgDragOver, setImgDragOver] = useState(false);

  // Step 3
  const [pairs, setPairs] = useState<MatchedPair[]>([]);
  const [unmatchedImages, setUnmatchedImages] = useState<UnmatchedImage[]>([]);
  // Manual reassignment: pair index → image file index in imageFiles
  const [reassignPairIdx, setReassignPairIdx] = useState<number | null>(null);

  // Step 4
  const [running, setRunning] = useState(false);
  const [submittedBatch, setSubmittedBatch] = useState<BatchRecord | null>(null);
  const [batches, setBatches] = useState<BatchRecord[]>(() => store.batches);
  const [batchOcrProgress, setBatchOcrProgress] = useState<{
    index: number; total: number; fileName: string; pct: number; status: string;
  } | null>(null);

  // ── CSV upload ──────────────────────────────────────────────────────────────
  const handleCSVFile = (file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast({ title: "Invalid file", description: "Please upload a .csv file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCSV(text);
      setCsvRows(result.rows);
      setCsvErrors(result.errors);
      setCsvFilename(file.name);
      if (result.rows.length === 0 && result.errors.length > 0) {
        toast({ title: "CSV parse error", description: result.errors[0], variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const csv = generateBatchCSVTemplate();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "TTB_Batch_Template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Image upload ─────────────────────────────────────────────────────────────
  const handleImageFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid = Array.from(newFiles).filter(f => f.type.startsWith("image/"));
    if (valid.length < newFiles.length) {
      toast({ title: "Some files skipped", description: "Only image files accepted.", variant: "destructive" });
    }
    setImageFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      const deduped = valid.filter(f => !names.has(f.name));
      return [...prev, ...deduped];
    });
  };

  // ── Build matches (Step 2 → 3) ───────────────────────────────────────────────
  const buildMatches = () => {
    const result = matchPairs(csvRows, imageFiles);
    setPairs(result.pairs);
    setUnmatchedImages(result.unmatchedImages);
    setStep(3);
  };

  // ── Manual reassignment ──────────────────────────────────────────────────────
  const reassignPair = (pairIdx: number, fileIdx: number | null) => {
    setPairs(prev => {
      const next = [...prev];
      if (fileIdx === null) {
        // Unassign
        const old = next[pairIdx];
        if (old.imageFile) {
          setUnmatchedImages(u => [...u, { file: old.imageFile!, matchStatus: "unmatched_image" }]);
        }
        next[pairIdx] = { ...old, imageFile: null, matchStatus: "unmatched_csv", matchMethod: "none" };
      } else {
        const file = imageFiles[fileIdx];
        // Free the file from its current pair if it's used elsewhere
        const existingIdx = next.findIndex(p => p.imageFile?.name === file.name);
        if (existingIdx !== -1 && existingIdx !== pairIdx) {
          next[existingIdx] = { ...next[existingIdx], imageFile: null, matchStatus: "unmatched_csv", matchMethod: "none" };
        }
        // Remove from unmatchedImages
        setUnmatchedImages(u => u.filter(u => u.file.name !== file.name));
        next[pairIdx] = { ...next[pairIdx], imageFile: file, matchStatus: "matched", matchMethod: "label_file" };
      }
      return next;
    });
    setReassignPairIdx(null);
  };

  // ── Run batch ────────────────────────────────────────────────────────────────
  const handleRunBatch = async () => {
    const matched = pairs.filter(p => p.imageFile !== null);
    if (matched.length === 0) {
      toast({ title: "No matched pairs", description: "At least one pair must be matched before running.", variant: "destructive" });
      return;
    }
    setRunning(true);
    setBatchOcrProgress({ index: 0, total: matched.length, fileName: "", pct: 0, status: "Initializing OCR…" });
    try {
      const batch = await store.runBatchPairs(
        matched,
        batchName || `Batch ${new Date().toLocaleDateString()} (${matched.length} labels)`,
        (index, total, fileName, pct, status) => {
          setBatchOcrProgress({ index, total, fileName, pct, status });
        }
      );
      setSubmittedBatch(batch);
      setBatches([...store.batches]);
      toast({ title: "Batch complete", description: `${batch.totalCount} labels processed.` });
      setStep(4);
    } catch (e: any) {
      toast({ title: "Batch failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setBatchOcrProgress(null);
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep(1);
    setCsvRows([]); setCsvErrors([]); setCsvFilename("");
    setImageFiles([]); setPairs([]); setUnmatchedImages([]);
    setSubmittedBatch(null); setBatchName(""); setReassignPairIdx(null);
  };

  const matchedCount = pairs.filter(p => p.matchStatus === "matched").length;
  const unmatchedCount = pairs.filter(p => p.matchStatus === "unmatched_csv").length + unmatchedImages.length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <SidebarTrigger className="text-muted-foreground md:hidden" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">Batch Upload</h1>
          <p className="text-sm text-muted-foreground">Upload COLA applications via CSV and match them to label images</p>
        </div>
        {step > 1 && step < 4 && (
          <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={handleReset}>
            <RefreshCw size={12} className="mr-1.5" />Start over
          </Button>
        )}
      </div>

      <StepBar current={step} />

      {/* ── STEP 1: Upload CSV ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-primary" />
                Upload COLA Applications (CSV)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                One row per COLA application. Include a <code className="text-[11px] bg-muted px-1 rounded">label_file</code> column
                to match rows to images by filename, or the app will fuzzy-match on brand name.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8 flex-1" onClick={handleDownloadTemplate}>
                  <Download size={12} className="mr-1.5" />Download Template
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8 flex-1" onClick={() => csvInputRef.current?.click()}>
                  <Upload size={12} className="mr-1.5" />Upload CSV
                </Button>
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVFile(f); e.target.value = ""; }} />
              </div>

              {csvErrors.length > 0 && (
                <div className="space-y-1">
                  {csvErrors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle size={11} className="shrink-0 mt-0.5" />{e}
                    </div>
                  ))}
                </div>
              )}

              {csvRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{csvFilename}</p>
                    <Badge className="border-0 bg-primary/10 text-primary text-[10px]">{csvRows.length} application{csvRows.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <div className="bg-muted/40 grid grid-cols-[2fr_2fr_1fr] gap-2 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <span>Brand Name</span>
                      <span>Class / Type</span>
                      <span>Label File</span>
                    </div>
                    <div className="divide-y divide-border max-h-52 overflow-y-auto">
                      {csvRows.map((row, i) => (
                        <div key={i} className="grid grid-cols-[2fr_2fr_1fr] gap-2 px-3 py-2 text-xs">
                          <span className="font-medium truncate">{row.brandName}</span>
                          <span className="text-muted-foreground truncate">{row.classType || "—"}</span>
                          <span className={`truncate font-mono text-[10px] ${row.labelFile ? "text-primary" : "text-muted-foreground"}`}>
                            {row.labelFile || "auto"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {csvRows.length === 0 && (
                <div className="border-2 border-dashed rounded-lg py-10 text-center">
                  <FileSpreadsheet size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Download the template, fill it out, then upload it here</p>
                </div>
              )}

              <div className="pt-1">
                <div className="mb-2">
                  <Label className="text-xs font-medium">Batch Name (optional)</Label>
                  <Input className="mt-1 h-8 text-sm" placeholder="e.g. Spring Import 2026"
                    value={batchName} onChange={e => setBatchName(e.target.value)} />
                </div>
                <Button className="w-full" disabled={csvRows.length === 0} onClick={() => setStep(2)}>
                  Continue <ArrowRight size={14} className="ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 2: Upload Images ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileImage size={15} className="text-primary" />
                Upload Label Images
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Upload all label image files. If your CSV has a <code className="text-[11px] bg-muted px-1 rounded">label_file</code> column,
                filenames must match exactly. Otherwise the app will match on brand name.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${imgDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                onDragOver={e => { e.preventDefault(); setImgDragOver(true); }}
                onDragLeave={() => setImgDragOver(false)}
                onDrop={e => { e.preventDefault(); setImgDragOver(false); handleImageFiles(e.dataTransfer.files); }}
                onClick={() => imgInputRef.current?.click()}
              >
                <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => handleImageFiles(e.target.files)} />
                <Layers size={28} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drop label images here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse · JPG, PNG, TIFF · up to 300 files</p>
              </div>

              {imageFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium">{imageFiles.length} image{imageFiles.length !== 1 ? "s" : ""} loaded</p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setImageFiles([])}>Clear</Button>
                  </div>
                  <div className="border rounded-md max-h-44 overflow-y-auto divide-y divide-border">
                    {imageFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <FileImage size={11} className="text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{f.name}</span>
                        <span className="text-muted-foreground text-[10px] shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  <ArrowLeft size={14} className="mr-1.5" />Back
                </Button>
                <Button className="flex-1" disabled={imageFiles.length === 0} onClick={buildMatches}>
                  Match Labels <ArrowRight size={14} className="ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 3: Review Matches ─────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Review Matches</CardTitle>
              <p className="text-xs text-muted-foreground">
                Verify each application is paired to the correct label image. Click any row to reassign manually.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 p-0 pb-4">
              {/* Summary bar */}
              <div className="flex gap-3 px-4 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                  <Link2 size={12} /><span className="font-semibold">{matchedCount}</span> matched
                </div>
                {unmatchedCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <Link2Off size={12} /><span className="font-semibold">{unmatchedCount}</span> unmatched
                  </div>
                )}
              </div>

              {/* Pairs table */}
              <div className="border-y divide-y divide-border max-h-[380px] overflow-y-auto">
                {pairs.map((pair, pIdx) => (
                  <div key={pIdx}
                    className={`px-4 py-2.5 transition-colors ${reassignPairIdx === pIdx ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold truncate">{pair.csvRow.brandName}</span>
                          {pair.csvRow.colaNumber && (
                            <span className="text-[10px] text-muted-foreground font-mono">{pair.csvRow.colaNumber}</span>
                          )}
                          <MatchBadge pair={pair} />
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <FileSpreadsheet size={10} />
                          <span className="truncate">{pair.csvRow.classType || "—"}</span>
                          <span className="mx-1 text-muted-foreground/40">→</span>
                          <FileImage size={10} />
                          {pair.imageFile ? (
                            <span className="truncate font-mono text-[10px]">{pair.imageFile.name}</span>
                          ) : (
                            <span className="text-red-500 italic">No image assigned</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 text-[10px] shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setReassignPairIdx(reassignPairIdx === pIdx ? null : pIdx)}
                      >
                        {reassignPairIdx === pIdx ? "Cancel" : "Reassign"}
                      </Button>
                    </div>

                    {/* Reassign dropdown */}
                    {reassignPairIdx === pIdx && (
                      <div className="mt-2 border rounded-md overflow-hidden">
                        <div className="bg-muted/40 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Select image to assign
                        </div>
                        <div className="max-h-36 overflow-y-auto divide-y divide-border">
                          <button
                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted/30 text-red-600 dark:text-red-400"
                            onClick={() => reassignPair(pIdx, null)}
                          >
                            <Link2Off size={11} className="inline mr-1.5" />Remove assignment
                          </button>
                          {imageFiles.map((f, fIdx) => {
                            const inUse = pairs.find((p, i) => i !== pIdx && p.imageFile?.name === f.name);
                            return (
                              <button
                                key={fIdx}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/30
                                  ${pair.imageFile?.name === f.name ? "bg-primary/5 text-primary" : ""}
                                  ${inUse ? "opacity-50" : ""}`}
                                onClick={() => reassignPair(pIdx, fIdx)}
                              >
                                <FileImage size={11} className="shrink-0 text-muted-foreground" />
                                <span className="truncate flex-1 font-mono text-[10px]">{f.name}</span>
                                {inUse && <span className="text-[9px] text-muted-foreground shrink-0">in use</span>}
                                {pair.imageFile?.name === f.name && <CheckCircle2 size={11} className="text-primary shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Unmatched images */}
              {unmatchedImages.length > 0 && (
                <div className="px-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Unmatched images (no CSV row found)
                  </p>
                  <div className="space-y-1">
                    {unmatchedImages.map((u, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileImage size={11} /><span className="truncate font-mono text-[10px]">{u.file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Batch OCR progress */}
              {running && batchOcrProgress && (
                <div className="px-4 pb-2 space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>
                      Label {batchOcrProgress.index + 1} of {batchOcrProgress.total}
                      {batchOcrProgress.fileName ? ` — ${batchOcrProgress.fileName}` : ""}
                    </span>
                    <span>{batchOcrProgress.pct}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(((batchOcrProgress.index) / batchOcrProgress.total) * 100 + (batchOcrProgress.pct / batchOcrProgress.total))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{batchOcrProgress.status}</p>
                </div>
              )}

              <div className="flex gap-2 px-4">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                  <ArrowLeft size={14} className="mr-1.5" />Back
                </Button>
                <Button className="flex-1" disabled={matchedCount === 0 || running} onClick={handleRunBatch}>
                  {running
                    ? <><Loader2 size={14} className="mr-2 animate-spin" />Reading labels…</>
                    : <><Upload size={14} className="mr-1.5" />Run Batch ({matchedCount} labels)</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 4: Results ───────────────────────────────────────────────────── */}
      {step === 4 && submittedBatch && (
        <div className="space-y-4">
          <Card className="border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={18} className="text-green-600" />
                <p className="text-sm font-semibold">Batch Complete</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3 truncate">{submittedBatch.name}</p>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-2.5">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{submittedBatch.passCount}</p>
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium">Pass</p>
                </div>
                <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-lg p-2.5">
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{submittedBatch.warningCount}</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Review</p>
                </div>
                <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-2.5">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">{submittedBatch.failCount}</p>
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium">Fail</p>
                </div>
              </div>
              <Progress
                className="h-1.5 mb-1.5"
                value={submittedBatch.totalCount > 0 ? (submittedBatch.passCount / submittedBatch.totalCount) * 100 : 0}
              />
              <p className="text-xs text-muted-foreground text-center mb-3">
                {submittedBatch.totalCount > 0
                  ? Math.round((submittedBatch.passCount / submittedBatch.totalCount) * 100)
                  : 0}% pass rate · {submittedBatch.totalCount} labels
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href="/queue">View Review Queue</Link>
                </Button>
                <Button size="sm" className="flex-1" onClick={handleReset}>
                  <RefreshCw size={13} className="mr-1.5" />New Batch
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Per-label breakdown */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Label Results</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {store.jobs
                  .filter(j => j.batchId === submittedBatch.id)
                  .map((job, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        job.overallResult === "pass" ? "bg-green-500"
                        : job.overallResult === "warning" ? "bg-yellow-500"
                        : "bg-red-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{job.originalName}</p>
                        {job.colaNumber && (
                          <p className="text-[10px] text-muted-foreground font-mono">{job.colaNumber}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{job.score}%</span>
                        <Badge className={`border-0 text-[10px] h-4 px-1.5 ${
                          job.overallResult === "pass"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : job.overallResult === "warning"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {job.overallResult === "warning" ? "Review" : job.overallResult}
                        </Badge>
                      </div>
                    </div>
                  ))
                }
              </div>
            </CardContent>
          </Card>

          {/* Previous batches */}
          {batches.length > 1 && (
            <Card>
              <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm font-semibold">Previous Batches</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {batches.slice(1, 6).map((batch) => (
                    <div key={batch.id} className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{batch.name}</p>
                        <p className="text-xs text-muted-foreground">{batch.totalCount} labels · {new Date(batch.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-xs">
                        <span className="text-green-600 flex items-center gap-0.5"><CheckCircle2 size={11} />{batch.passCount}</span>
                        <span className="text-yellow-600 flex items-center gap-0.5"><AlertTriangle size={11} />{batch.warningCount}</span>
                        <span className="text-red-600 flex items-center gap-0.5"><XCircle size={11} />{batch.failCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
