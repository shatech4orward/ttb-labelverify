import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-6">
      <p className="text-4xl font-bold text-muted-foreground/30 mb-2">404</p>
      <h1 className="text-lg font-semibold mb-1">Page not found</h1>
      <p className="text-sm text-muted-foreground mb-4">The page you're looking for doesn't exist.</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Go to Dashboard</Link>
      </Button>
    </div>
  );
}
