import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, ScanLine, Layers, Clock, TrendingUp, BookOpen } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { store, Job } from "@/lib/store";

function StatusBadge({ result }: { result: string }) {
  if (result === "pass") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">Pass</Badge>;
  if (result === "fail") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">Fail</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-0 text-xs">Review</Badge>;
}

export default function Dashboard() {
  const [tick, setTick] = useState(0);
  useEffect(() => { setTick(t => t + 1); }, []);

  const stats = store.getStats();
  const recentJobs = store.jobs.slice(0, 8);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger className="text-muted-foreground md:hidden" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">TTB Alcohol Label Verification Overview</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button asChild size="sm" data-testid="button-verify-label">
            <Link href="/verify"><ScanLine size={14} className="mr-1.5" />Verify Label</Link>
          </Button>
          <Button asChild size="sm" variant="outline" data-testid="button-batch-upload">
            <Link href="/batch"><Layers size={14} className="mr-1.5" />Batch Upload</Link>
          </Button>
          <Button asChild size="sm" variant="outline" data-testid="button-reviewer-guide">
            <a href="https://github.com/shatech4orward/ttb-labelverify/raw/main/docs/TTB_LabelVerify_Reviewer_Guide.pdf" target="_blank" rel="noopener noreferrer">
              <BookOpen size={14} className="mr-1.5" />Reviewer Guide
            </a>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card data-testid="card-stat-total">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-muted-foreground font-medium">Total Reviewed</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{stats.total}</p></div>
              <div className="p-1.5 rounded-md bg-primary/10"><TrendingUp size={16} className="text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-pass">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-muted-foreground font-medium">Passed</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-0.5">{stats.pass}</p></div>
              <div className="p-1.5 rounded-md bg-green-100 dark:bg-green-900/20"><CheckCircle2 size={16} className="text-green-600 dark:text-green-400" /></div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-fail">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-muted-foreground font-medium">Failed</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-0.5">{stats.fail}</p></div>
              <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/20"><XCircle size={16} className="text-red-600 dark:text-red-400" /></div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-warning">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-muted-foreground font-medium">Needs Review</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-0.5">{stats.warning}</p></div>
              <div className="p-1.5 rounded-md bg-yellow-100 dark:bg-yellow-900/20"><AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Verifications</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/queue">View all</Link></Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentJobs.length === 0 ? (
            <div className="py-12 text-center">
              <ScanLine size={32} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No verifications yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Upload a label to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentJobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors" data-testid={`row-job-${job.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded bg-muted shrink-0"><ScanLine size={14} className="text-muted-foreground" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{job.originalName}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {job.beverageType.replace("_", " ")} · {new Date(job.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">{job.score}%</span>
                      <StatusBadge result={job.overrideResult || job.overallResult} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { icon: ScanLine, title: "Single Verify", desc: "Upload one label with application data for instant compliance check.", href: "/verify" },
          { icon: Layers, title: "Batch Upload", desc: "Submit 200–300 labels at once for bulk processing.", href: "/batch" },
          { icon: Clock, title: "Review Queue", desc: "Manage labels flagged for agent review.", href: "/queue" },
        ].map(({ icon: Icon, title, desc, href }) => (
          <Link key={href} href={href}>
            <Card className="cursor-pointer h-full hover:border-primary/40 transition-colors">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1.5"><Icon size={15} className="text-primary" /><p className="text-sm font-medium">{title}</p></div>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
