import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CheckCircle2, XCircle, AlertTriangle, Search, Trash2, ScanLine } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { store, Job } from "@/lib/store";

function StatusBadge({ result }: { result: string }) {
  if (result === "pass") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">Pass</Badge>;
  if (result === "fail") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">Fail</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-0 text-xs">Needs Review</Badge>;
}

export default function ReviewQueue() {
  const [jobs, setJobs] = useState<Job[]>(() => store.jobs);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "score">("newest");
  const { toast } = useToast();

  const handleDelete = (id: number) => {
    store.deleteJob(id);
    setJobs([...store.jobs]);
    toast({ title: "Deleted", description: "Verification record removed." });
  };

  const effectiveResult = (j: Job) => j.overrideResult || j.overallResult;

  const filtered = jobs
    .filter(j => filter === "all" || effectiveResult(j) === filter)
    .filter(j => !search || j.originalName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === "newest") return b.createdAt - a.createdAt;
      if (sort === "oldest") return a.createdAt - b.createdAt;
      return b.score - a.score;
    });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger className="text-muted-foreground md:hidden" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Review Queue</h1>
          <p className="text-sm text-muted-foreground">{jobs.length} total verifications</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search by filename..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="pass">Pass Only</SelectItem>
            <SelectItem value="warning">Needs Review</SelectItem>
            <SelectItem value="fail">Fail Only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as any)}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="score">By Score</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ScanLine size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No results match your filter</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((job) => (
                <div key={job.id} className="px-4 py-3 hover:bg-accent/40 transition-colors" data-testid={`row-queue-${job.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded bg-muted shrink-0">
                        {effectiveResult(job) === "pass" && <CheckCircle2 size={13} className="text-green-600" />}
                        {effectiveResult(job) === "fail" && <XCircle size={13} className="text-red-600" />}
                        {effectiveResult(job) === "warning" && <AlertTriangle size={13} className="text-yellow-600" />}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/jobs/${job.id}`}>
                          <p className="text-sm font-medium text-foreground truncate hover:text-primary cursor-pointer">{job.originalName}</p>
                        </Link>
                        <p className="text-xs text-muted-foreground capitalize">
                          {job.beverageType.replace("_", " ")} · {new Date(job.createdAt).toLocaleDateString()}
                          {job.batchId && <span className="ml-1.5 opacity-60">batch</span>}
                          {job.overrideResult && <span className="ml-1.5 text-blue-600 dark:text-blue-400">overridden</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium tabular-nums hidden sm:block">{job.score}%</span>
                      <StatusBadge result={effectiveResult(job)} />
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link href={`/jobs/${job.id}`}><ScanLine size={13} /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          onClick={() => handleDelete(job.id)} data-testid={`button-delete-${job.id}`}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
