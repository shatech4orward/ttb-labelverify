import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Upload, CheckCircle2, XCircle, AlertTriangle,
  FileImage, FileText, Loader2, Info, X,
  FileScan, PencilLine,
} from "lucide-react";
import { Link } from "wouter";
import { store, Job } from "@/lib/store";
import { parseCOLAPDF, ParsedCOLA } from "@/lib/colaParser";

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === "pass")    return <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0" />;
  if (status === "fail")    return <XCircle size={16} className="text-red-600 dark:text-red-400 shrink-0" />;
  if (status === "warning") return <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400 shrink-0" />;
  return <Info size={16} className="text-muted-foreground shrink-0" />;
}

function FieldStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pass:      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    fail:      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    warning:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    not_found: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = { pass: "Pass", fail: "Fail", warning: "Review", not_found: "Not Found" };
  return <Badge className={`border-0 text-xs ${map[status] || "bg-muted text-muted-foreground"}`}>{labels[status] || status}</Badge>;
}

// ── Upload Zone ────────────────────────────────────────────────────────────────

interface UploadZoneProps {
  file: File | null;
  onFile: (f: File | null) => void;
  accept: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
}

function UploadZone({ file, onFile, accept, label, hint, icon, disabled, loading, testId }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handle = (f: File | undefined | null) => { if (!f || disabled) return; onFile(f); };

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-5 text-center transition-colors
        ${disabled ? "opacity-40 cursor-not-allowed border-border bg-muted/20"
          : dragOver ? "border-primary bg-primary/5 cursor-pointer"
          : file ? "border-primary/40 cursor-pointer"
          : "border-border hover:border-primary/50 cursor-pointer"}`}
      onDragOver={(e) => { if (disabled) return; e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handle(e.dataTransfer.files[0]); }}
      onClick={() => { if (!disabled) inputRef.current?.click(); }}
      data-testid={testId}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {loading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={22} className="animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Reading application…</p>
        </div>
      ) : file ? (
        <div className="flex items-center justify-center gap-2">
          <div className="text-primary">{icon}</div>
          <span className="text-sm font-medium truncate max-w-[180px]">{file.name}</span>
          {!disabled && (
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-foreground rounded-full p-0.5 transition-colors"
              onClick={(e) => { e.stopPropagation(); onFile(null); }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="flex justify-center mb-2 text-muted-foreground">{icon}</div>
          <p className={`text-sm font-medium ${disabled ? "text-muted-foreground" : ""}`}>{label}</p>
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        </div>
      )}
    </div>
  );
}

// ── Confidence badge ───────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const map = {
    high:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    low:    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <Badge className={`border-0 text-[10px] h-4 px-1.5 ${map[level]}`}>
      {level === "high" ? "High confidence" : level === "medium" ? "Medium confidence — review fields" : "Low confidence — verify all fields"}
    </Badge>
  );
}

// ── Application entry mode toggle ──────────────────────────────────────────────

type EntryMode = "pdf" | "manual";

interface ModeToggleProps {
  mode: EntryMode;
  onChange: (m: EntryMode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex rounded-lg border overflow-hidden text-xs font-medium select-none">
      <button
        type="button"
        onClick={() => onChange("pdf")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 transition-colors
          ${mode === "pdf"
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-muted/50"}`}
      >
        <FileScan size={13} />
        Upload PDF
      </button>
      <button
        type="button"
        onClick={() => onChange("manual")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 transition-colors border-l
          ${mode === "manual"
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-muted/50"}`}
      >
        <PencilLine size={13} />
        Enter Manually
      </button>
    </div>
  );
}

// ── Empty field value ──────────────────────────────────────────────────────────

const EMPTY = { brandName: "", classType: "", alcoholContent: "", netContents: "", nameAddress: "", countryOfOrigin: "", beverageType: "" };

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Verify() {
  const [labelFile, setLabelFile]     = useState<File | null>(null);
  const [appFile, setAppFile]         = useState<File | null>(null);
  const [entryMode, setEntryMode]     = useState<EntryMode>("pdf");
  const [parsing, setParsing]         = useState(false);
  const [parsed, setParsed]           = useState<ParsedCOLA | null>(null);
  const [running, setRunning]         = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ pct: number; status: string } | null>(null);
  const [result, setResult]           = useState<Job | null>(null);
  const [appData, setAppData]         = useState({ ...EMPTY });

  const { toast } = useToast();
  const [, navigate] = useLocation();

  // ── Mode switch — clear opposing state ──────────────────────────────────────
  const handleModeChange = (m: EntryMode) => {
    setEntryMode(m);
    setResult(null);
    if (m === "manual") {
      setAppFile(null);
      setParsed(null);
    } else {
      setAppData({ ...EMPTY });
    }
  };

  // ── Label file ───────────────────────────────────────────────────────────────
  const handleLabelFile = (f: File | null) => {
    if (f && !f.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Label must be an image file (JPG, PNG, TIFF).", variant: "destructive" });
      return;
    }
    setLabelFile(f);
    setResult(null);
  };

  // ── PDF application upload + parse ───────────────────────────────────────────
  const handleAppFile = async (f: File | null) => {
    setAppFile(f);
    setParsed(null);
    setResult(null);
    if (!f) return;

    setParsing(true);
    try {
      const result = await parseCOLAPDF(f);
      setParsed(result);
      // Populate fields from parsed data
      setAppData({
        brandName:      result.brandName      || "",
        classType:      result.classType      || "",
        alcoholContent: result.alcoholContent || "",
        netContents:    result.netContents    || "",
        nameAddress:    result.nameAddress    || "",
        countryOfOrigin:result.countryOfOrigin|| "",
        beverageType:   result.beverageType   || "",
      });

      const found = result.fieldsFound.length;
      if (found === 0) {
        toast({
          title: "No fields extracted",
          description: "Could not read data from this PDF. Try entering details manually.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `${found} field${found !== 1 ? "s" : ""} extracted`,
          description: "Review the populated fields before running verification.",
        });
      }
    } catch (e: any) {
      toast({ title: "PDF read error", description: e.message || "Could not parse the PDF.", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  // ── Run verification ─────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!labelFile) {
      toast({ title: "Label required", description: "Upload a label image first.", variant: "destructive" });
      return;
    }
    setRunning(true);
    setOcrProgress({ pct: 0, status: "Starting OCR…" });
    try {
      const job = await store.runVerification(
        labelFile,
        {
          brandName:       appData.brandName       || undefined,
          classType:       appData.classType       || undefined,
          alcoholContent:  appData.alcoholContent  || undefined,
          netContents:     appData.netContents     || undefined,
          nameAddress:     appData.nameAddress     || undefined,
          countryOfOrigin: appData.countryOfOrigin || undefined,
          beverageType:    appData.beverageType    || undefined,
        },
        (pct, status) => setOcrProgress({ pct, status })
      );
      setResult(job);
    } catch (e: any) {
      toast({ title: "Verification error", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setOcrProgress(null);
    }
  };

  const overallColor =
    result?.overallResult === "pass"    ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20"
    : result?.overallResult === "fail"  ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
    : "border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/20";

  const hasAppData = Object.values(appData).some(v => v.trim() !== "");
  const pdfReady   = entryMode === "pdf" && !!appFile && !parsing;
  const manualReady= entryMode === "manual" && hasAppData;
  const canRun     = !!labelFile && (pdfReady || manualReady) && !running;

  const buttonLabel = running && ocrProgress
    ? `Reading label… ${ocrProgress.pct}%`
    : running                        ? "Verifying…"
    : !labelFile                     ? "Upload label to continue"
    : entryMode === "pdf" && !appFile? "Upload application PDF to continue"
    : entryMode === "pdf" && parsing ? "Reading PDF…"
    : entryMode === "manual" && !hasAppData ? "Enter application data to continue"
    : "Run Verification";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger className="text-muted-foreground md:hidden" />
        <div>
          <h1 className="text-xl font-semibold">Verify Label</h1>
          <p className="text-sm text-muted-foreground">Upload a label image and provide the COLA application data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Left column ───────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Label upload */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Label Image</CardTitle>
              <p className="text-xs text-muted-foreground">Upload the label to be verified against TTB requirements</p>
            </CardHeader>
            <CardContent>
              <UploadZone
                file={labelFile}
                onFile={handleLabelFile}
                accept="image/*"
                label="Drop label image here"
                hint="JPG, PNG, TIFF · up to 10 MB"
                icon={<FileImage size={22} />}
                testId="dropzone-label"
              />
            </CardContent>
          </Card>

          {/* Application data — mode toggle + content */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">COLA Application Data</CardTitle>
              <p className="text-xs text-muted-foreground">
                Upload the COLA application PDF to auto-populate fields, or enter details manually
              </p>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Toggle */}
              <ModeToggle mode={entryMode} onChange={handleModeChange} />

              {/* ── PDF mode ──────────────────────────────────────────────── */}
              {entryMode === "pdf" && (
                <div className="space-y-3">
                  <UploadZone
                    file={appFile}
                    onFile={handleAppFile}
                    accept=".pdf,application/pdf"
                    label="Drop COLA application PDF here"
                    hint="TTB Form 5100.31 or similar · PDF only"
                    icon={<FileText size={22} />}
                    loading={parsing}
                    testId="dropzone-application"
                  />

                  {/* Parsed fields preview / override */}
                  {appFile && !parsing && (
                    <div className="space-y-3">
                      {parsed && (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            Fields extracted — review and correct if needed
                          </p>
                          <ConfidenceBadge level={parsed.confidence} />
                        </div>
                      )}
                      {renderFields(appData, setAppData, "Editable — correct any extraction errors")}
                    </div>
                  )}
                </div>
              )}

              {/* ── Manual mode ───────────────────────────────────────────── */}
              {entryMode === "manual" && (
                <div className="space-y-3">
                  {renderFields(appData, setAppData, "Enter values exactly as they appear in the COLA application")}
                </div>
              )}

              {/* OCR progress bar */}
              {running && ocrProgress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{ocrProgress.status}</span>
                    <span>{ocrProgress.pct}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${ocrProgress.pct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Run button */}
              <Button
                className="w-full"
                onClick={handleRun}
                disabled={!canRun}
                data-testid="button-submit-verify"
              >
                {running || parsing
                  ? <><Loader2 size={14} className="mr-2 animate-spin" />{buttonLabel}</>
                  : !canRun
                    ? <><Upload size={14} className="mr-2" />{buttonLabel}</>
                    : <><CheckCircle2 size={14} className="mr-2" />{buttonLabel}</>
                }
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Right column — results ─────────────────────────────────────────── */}
        <div>
          {!result ? (
            <Card className="h-full">
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <CheckCircle2 size={32} className="text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Verification results will appear here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {entryMode === "pdf"
                    ? "Upload both files and click Run Verification"
                    : "Upload a label, enter application data, and click Run Verification"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Overall result banner */}
              <div className={`border rounded-lg p-4 ${overallColor}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.overallResult === "pass"    && <CheckCircle2 size={20} className="text-green-600" />}
                    {result.overallResult === "fail"    && <XCircle size={20} className="text-red-600" />}
                    {result.overallResult === "warning" && <AlertTriangle size={20} className="text-yellow-600" />}
                    <div>
                      <p className="text-sm font-semibold">
                        {result.overallResult === "pass"    ? "Label Compliant"
                        : result.overallResult === "warning"? "Needs Review"
                        : "Label Non-Compliant"}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {result.beverageType.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{result.score}%</p>
                    <p className="text-xs text-muted-foreground">compliance</p>
                  </div>
                </div>
              </div>

              {/* Issues / warnings */}
              {(result.issues.length > 0 || result.warnings.length > 0) && (
                <Card>
                  <CardContent className="pt-3 pb-3 space-y-1.5">
                    {result.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
                        <XCircle size={12} className="shrink-0" />{issue}
                      </div>
                    ))}
                    {result.warnings.map((warn, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
                        <AlertTriangle size={12} className="shrink-0" />{warn}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Field-by-field */}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold">Field-by-Field Check</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {result.fields.map((field, i) => (
                      <div key={i} className="px-4 py-3" data-testid={`field-result-${i}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <StatusIcon status={field.status} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground">{field.field}</p>
                              {field.labelValue && (
                                <p className="text-xs text-muted-foreground truncate">
                                  Label: <span className="font-mono">{field.labelValue.substring(0, 60)}{field.labelValue.length > 60 ? "…" : ""}</span>
                                </p>
                              )}
                              {field.applicationValue && field.applicationValue !== field.labelValue && (
                                <p className="text-xs text-muted-foreground truncate">
                                  Application: <span className="font-mono">{field.applicationValue.substring(0, 60)}{field.applicationValue.length > 60 ? "…" : ""}</span>
                                </p>
                              )}
                              {field.note && <p className="text-xs text-muted-foreground/80 italic mt-0.5">{field.note}</p>}
                            </div>
                          </div>
                          <FieldStatusBadge status={field.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Button variant="outline" size="sm" asChild>
                <Link href={`/jobs/${result.id}`}>View Full Report</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared field renderer (used in both PDF and manual modes) ──────────────────

function renderFields(
  appData: Record<string, string>,
  setAppData: React.Dispatch<React.SetStateAction<any>>,
  hint?: string
) {
  const fields = [
    { key: "beverageType",   label: "Beverage Type",            type: "select" },
    { key: "brandName",      label: "Brand Name",               placeholder: "e.g. OLD TOM DISTILLERY" },
    { key: "classType",      label: "Class / Type",             placeholder: "e.g. Kentucky Straight Bourbon Whiskey" },
    { key: "alcoholContent", label: "Alcohol Content",          placeholder: "e.g. 45 or 45% Alc./Vol." },
    { key: "netContents",    label: "Net Contents",             placeholder: "e.g. 750 or 750 mL" },
    { key: "nameAddress",    label: "Name & Address",           placeholder: "e.g. Old Tom Distillery, Bardstown, KY" },
    { key: "countryOfOrigin",label: "Country of Origin",        placeholder: "e.g. Scotland — leave blank for domestic" },
  ];

  return (
    <div className="space-y-2.5">
      {hint && <p className="text-[11px] text-muted-foreground italic">{hint}</p>}
      {fields.map(({ key, label, placeholder, type }) =>
        type === "select" ? (
          <div key={key}>
            <Label className="text-xs font-medium">{label}</Label>
            <Select
              value={appData[key]}
              onValueChange={(v) => setAppData((p: any) => ({ ...p, [key]: v }))}
            >
              <SelectTrigger className="mt-1 text-sm h-8" data-testid="select-beverage-type">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="distilled_spirits">Distilled Spirits</SelectItem>
                <SelectItem value="wine">Wine</SelectItem>
                <SelectItem value="beer">Beer / Malt Beverage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div key={key}>
            <Label className="text-xs font-medium">{label}</Label>
            <Input
              className="mt-1 h-8 text-sm"
              placeholder={placeholder}
              value={appData[key]}
              onChange={(e) => setAppData((p: any) => ({ ...p, [key]: e.target.value }))}
              data-testid={`input-${key}`}
            />
          </div>
        )
      )}
    </div>
  );
}
