import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import UploadPanel from "@/components/UploadPanel";
import InvoiceTable from "@/components/InvoiceTable";
import AppHeader from "@/components/AppHeader";

const Index = () => {
  const { user, loading } = useAuth();
  const { currentOrg, loading: orgLoading } = useCurrentOrg();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);

  // 1. Handle Navigation separately
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // 2. Optimized Loading Check
  // Only show the spinner if we have NO user and NO org data yet.
  // This stops the page from refreshing/resetting when switching tabs.
  const isInitialLoading = loading || (orgLoading && !currentOrg);

  if (isInitialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Final safety check
  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {!currentOrg ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted-foreground">
              No organization found for your account. 
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              (Check Supabase organization_members table)
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            {/* The Sidebar (Upload) */}
            <aside>
              <UploadPanel
                onUploadComplete={(names) => {
                  setPendingFiles((prev) => [...prev, ...names]);
                  setRefreshKey((k) => k + 1);
                }}
              />
            </aside>

            {/* The Main Content (Table) */}
            <section>
              <InvoiceTable
                refreshKey={refreshKey}
                pendingFiles={pendingFiles}
                onFilesSettled={(settled) =>
                  setPendingFiles((prev) => prev.filter((n) => !settled.includes(n)))
                }
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;