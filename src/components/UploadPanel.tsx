import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useAuth } from "@/hooks/useAuth";

const MAX_FILES = 20;
const MAX_SIZE = 15 * 1024 * 1024;

interface UploadPanelProps {
  onUploadComplete: (queuedFileNames: string[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export default function UploadPanel({ onUploadComplete }: UploadPanelProps) {
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentOrg } = useCurrentOrg();
  const { session, user } = useAuth();

  const addFiles = useCallback((files: FileList | File[]) => {
    setError("");
    setWarning("");
    const incoming = Array.from(files);
    const valid: File[] = [];

    for (const f of incoming) {
      if (f.type !== "application/pdf") {
        setError(`"${f.name}" is not a PDF. Only PDF invoices are supported.`);
        return;
      }
      if (f.size > MAX_SIZE) {
        setError(`"${f.name}" exceeds the 15 MB limit.`);
        return;
      }
      valid.push(f);
    }

    setStagedFiles((prev) => {
      const total = prev.length + valid.length;
      if (total > MAX_FILES) {
        setWarning(`Max ${MAX_FILES} files at once. ${total - MAX_FILES} file(s) skipped.`);
        return [...prev, ...valid.slice(0, MAX_FILES - prev.length)];
      }
      return [...prev, ...valid];
    });
  }, []);

  const removeFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
    setWarning("");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleUpload = async () => {
    console.log("[Upload] triggered", { currentOrg, hasSession: !!session?.access_token, userId: user?.id, files: stagedFiles.map(f => f.name) });

    if (!currentOrg) { setError("No organization found. Check Supabase organization_members."); console.error("[Upload] no currentOrg"); return; }
    if (!session?.access_token) { setError("Not authenticated. Please sign out and sign back in."); console.error("[Upload] no session token"); return; }
    if (stagedFiles.length === 0) { console.warn("[Upload] no staged files"); return; }

    setUploading(true);
    setError("");
    setProgress({ done: 0, total: stagedFiles.length });

    const errors: string[] = [];
    const queued: string[] = [];

    for (let i = 0; i < stagedFiles.length; i++) {
      const formData = new FormData();
      formData.append("document", stagedFiles[i]);
      if (user?.id) formData.append("uploaded_by_user_id", user.id);

      try {
        const res = await fetch("/api/v1/invoices/upload", {
          method: "POST",
          headers: {
            "x-org-id": currentOrg.id,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          errors.push(`${stagedFiles[i].name}: ${res.status} ${body?.message ?? res.statusText}`);
        } else {
          queued.push(stagedFiles[i].name);
        }
      } catch (err) {
        errors.push(`${stagedFiles[i].name}: Cannot reach backend (is it running on port 3000?)`);
      }

      setProgress({ done: i + 1, total: stagedFiles.length });
    }

    setStagedFiles([]);
    setWarning("");
    setProgress(null);
    setUploading(false);
    onUploadComplete(queued);

    if (errors.length > 0) {
      setError(errors.join(" | "));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload Invoices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Drag & drop PDF invoices here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            PDF only — max 15 MB per file, up to {MAX_FILES} files
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {warning && (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            {warning}
          </div>
        )}

        {stagedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} staged
              {progress && ` — ${progress.done}/${progress.total} sent`}
            </p>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {stagedFiles.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 truncate">
                    {uploading && progress && i < progress.done
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      : uploading
                      ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      : null}
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatFileSize(f.size)}</span>
                  </div>
                  {!uploading && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button onClick={handleUpload} disabled={uploading} className="w-full">
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing {progress?.done ?? 0}/{progress?.total ?? stagedFiles.length}…
                </>
              ) : (
                `Submit ${stagedFiles.length} Invoice${stagedFiles.length > 1 ? "s" : ""} for Processing`
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}