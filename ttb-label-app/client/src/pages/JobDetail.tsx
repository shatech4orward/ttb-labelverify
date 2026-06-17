import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Info, Save, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { store } from "@/lib/store";

function StatusIcon({ status }: { status: string }) {
  if (status === "pass") return <CheckCircle2 size={15} className="text-green-600 shrink-0" />;
  if (status === "fail") return <XCircle size={15} className="text-red-600 shrink-0" />;
  if (status === "warning") return <AlertTriangle size={15} className="text-yellow-600 shrink-0" />;
  return <Info size={15} className="text-muted-foreground shrink-0" />;
}

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const jobId = Number(params?.id);
  const { toast } = useToast();

  const job = store.getJob(jobId);
  const [agentNotes, setAgentNotes] = useState(job?.agentNotes || "");
  const [overrideResult, setOverrideResult] = useState(job?.overrideResult || "");

  if (!job) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <p className="text-muted-foreground">Job not found.</p>
        <Button asChild variant="outline" className="mt-4"><Link href="/queue">Back to Queue</Link></Button>
      </div>
    );
  }

  const effectiveResult = overrideResult || job.overallResult;

  const handleSave = () => {
    store.updateJob(jobId, { agentNotes, overrideResult: overrideResult || null });
    toast({ title: "Saved", description: "Agent notes saved." });
  };

  const overallBg = effectiveResult === "pass"
    ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20"
    : effectiveResult === "fail"
      ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
      : "border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/20";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger className="text-muted-foreground md:hidden" />
        <Button variant="ghost" size="sm" asChild className="mr-1">
          <Link href="/queue"><ArrowLeft size={14} className="mr-1" />Queue</Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{job.originalName}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(job.createdAt).toLocaleString()} · <span className="capitalize">{job.beverageType.replace("_", " ")}</span>
            {job.batchId && " · Batch submission"}
          </p>
        </div>
        <Badge className={`border-0 text-xs shrink-0 ${effectiveResult === "pass" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : effectiveResult === "fail" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
          {effectiveResult === "pass" ? "Pass" : effectiveResult === "fail" ? "Fail" : "Needs Review"}
          {overrideResult && " (overridden)"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Summary */}
          <div className={`border rounded-lg p-4 ${overallBg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {effectiveResult === "pass" && <CheckCircle2 size={20} className="text-green-600" />}
                {effectiveResult === "fail" && <XCircle size={20} className="text-red-600" />}
                {effectiveResult === "warning" && <AlertTriangle size={20} className="text-yellow-600" />}
                <div>
                  <p className="text-sm font-semibold">
                    {effectiveResult === "pass" ? "Label Compliant" : effectiveResult === "fail" ? "Label Non-Compliant" : "Needs Agent Review"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.issues.length > 0 ? `${job.issues.length} issue(s)` : "No critical issues"}
                    {job.warnings.length > 0 ? ` · ${job.warnings.length} warning(s)` : ""}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{job.score}%</p>
                <p className="text-xs text-muted-foreground">compliance score</p>
              </div>
            </div>
          </div>

          {/* Issues */}
          {(job.issues.length > 0 || job.warnings.length > 0) && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle size={14} />Flagged Issues</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {job.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400"><XCircle size={12} className="shrink-0 mt-0.5" />{issue}</div>
                ))}
                {job.warnings.map((warn, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-400"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{warn}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Fields */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><FileText size={14} />Field-by-Field Check</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {job.fields.map((field, i) => (
                  <div key={i} className="px-4 py-3" data-testid={`field-detail-${i}`}>
                    <div className="flex items-start gap-2.5">
                      <StatusIcon status={field.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-xs font-semibold">{field.field}</p>
                          <Badge className={`border-0 text-xs shrink-0 ${field.status === "pass" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : field.status === "fail" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : field.status === "warning" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-muted text-muted-foreground"}`}>
                            {field.status === "not_found" ? "Not Found" : field.status === "not_required" ? "N/A" : field.status.charAt(0).toUpperCase() + field.status.slice(1)}
                          </Badge>
                        </div>
                        {field.labelValue && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">Label:</span> <span className="font-mono">{field.labelValue.length > 120 ? field.labelValue.substring(0, 120) + "..." : field.labelValue}</span></p>}
                        {field.applicationValue && field.applicationValue !== field.labelValue && (
                          <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium text-foreground/70">Application:</span> <span className="font-mono">{field.applicationValue.length > 120 ? field.applicationValue.substring(0, 120) + "..." : field.applicationValue}</span></p>
                        )}
                        {field.note && <p className="text-xs text-muted-foreground/80 italic mt-1">{field.note}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Agent Notes</CardTitle>
              <p className="text-xs text-muted-foreground">Add notes or override the AI result</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs font-medium">Override Result</Label>
                <Select value={overrideResult} onValueChange={setOverrideResult}>
                  <SelectTrigger className="mt-1 h-8 text-sm" data-testid="select-override">
                    <SelectValue placeholder="Keep AI result..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Override: Pass</SelectItem>
                    <SelectItem value="fail">Override: Fail</SelectItem>
                    <SelectItem value="warning">Override: Needs Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Notes</Label>
                <Textarea className="mt-1 text-sm min-h-[100px]"
                  placeholder="e.g. Brand name capitalization difference is acceptable per policy."
                  value={agentNotes} onChange={e => setAgentNotes(e.target.value)}
                  data-testid="textarea-agent-notes" />
              </div>
              <Button size="sm" className="w-full" onClick={handleSave} data-testid="button-save-notes">
                <Save size={13} className="mr-1.5" />Save Notes
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4 space-y-1.5 text-xs">
              <p className="font-semibold text-sm mb-2">Job Details</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Job ID</span><span className="font-mono">#{job.id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{job.beverageType.replace("_", " ")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span>{job.score}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{new Date(job.createdAt).toLocaleTimeString()}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
