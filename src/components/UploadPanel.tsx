import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  FileText,
  AlertTriangle,
  SlidersHorizontal,
  Play
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useAuth } from "@/hooks/useAuth";
import ColumnMappingModal, {
  type PreviewData,
  type SavedMappingPreset
} from "./ColumnMappingModal";

const MAX_PDF_FILES = 20;
const MAX_PDF_SIZE = 15 * 1024 * 1024;
const MAX_CSV_SIZE = 20 * 1024 * 1024;

const CSV_TEMPLATE_HEADERS = [
  "invoice_number",
  "vendor_name",
  "vendor_tax_id",
  "invoice_date",
  "due_date",
  "amount",
  "currency",
  "po_number",
  "grn_number",
  "line_items_description",
  "payment_terms"
];

interface FailedRowReport {
  row_number: number;
  reason: string;
  row_data?: Record<string, string>;
}

interface CsvBulkImportResult {
  success_count: number;
  failed_count: number;
  failed_rows: FailedRowReport[];
}

interface UploadPanelProps {
  onUploadComplete: (queuedFileNames: string[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function escapeCsvCell(cell: unknown): string {
  if (cell == null) return '""';
  const str = String(cell);
  return `"${str.replace(/"/g, '""')}"`;
}

export default function UploadPanel({ onUploadComplete }: UploadPanelProps) {
  // ── PDF Tab State ──
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [pdfWarning, setPdfWarning] = useState("");
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── CSV Tab State ──
  const [stagedCsvFile, setStagedCsvFile] = useState<File | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [previewingCsv, setPreviewingCsv] = useState(false);
  const [confirmingCsv, setConfirmingCsv] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [csvResult, setCsvResult] = useState<CsvBulkImportResult | null>(null);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Column Mapping Modal State ──
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [savedPresets, setSavedPresets] = useState<SavedMappingPreset[]>([]);

  const { currentOrg } = useCurrentOrg();
  const { session, user } = useAuth();

  // Load saved mapping presets when org changes
  useEffect(() => {
    if (!currentOrg || !session?.access_token) return;

    fetch("/api/v1/invoices/bulk-import/saved-mappings", {
      headers: {
        "x-org-id": currentOrg.id,
        Authorization: `Bearer ${session.access_token}`
      }
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSavedPresets(data))
      .catch(() => setSavedPresets([]));
  }, [currentOrg, session?.access_token]);

  // ──────────────────────────────
  // PDF Actions
  // ──────────────────────────────
  const addPdfFiles = useCallback((files: FileList | File[]) => {
    setPdfError("");
    setPdfWarning("");
    const incoming = Array.from(files);
    const valid: File[] = [];

    for (const f of incoming) {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        setPdfError(`"${f.name}" is not a PDF. Only PDF invoices are supported.`);
        return;
      }
      if (f.size > MAX_PDF_SIZE) {
        setPdfError(`"${f.name}" exceeds the 15 MB limit.`);
        return;
      }
      valid.push(f);
    }

    setStagedFiles((prev) => {
      const total = prev.length + valid.length;
      if (total > MAX_PDF_FILES) {
        setPdfWarning(`Max ${MAX_PDF_FILES} files at once. ${total - MAX_PDF_FILES} file(s) skipped.`);
        return [...prev, ...valid.slice(0, MAX_PDF_FILES - prev.length)];
      }
      return [...prev, ...valid];
    });
  }, []);

  const removePdfFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
    setPdfWarning("");
  };

  const handlePdfUpload = async () => {
    if (!currentOrg) {
      setPdfError("No organization found. Check Supabase organization_members.");
      return;
    }
    if (!session?.access_token) {
      setPdfError("Not authenticated. Please sign out and sign back in.");
      return;
    }
    if (stagedFiles.length === 0) return;

    setUploadingPdf(true);
    setPdfError("");
    setPdfProgress({ done: 0, total: stagedFiles.length });

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
            Authorization: `Bearer ${session.access_token}`
          },
          body: formData
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          errors.push(`${stagedFiles[i].name}: ${res.status} ${body?.message ?? res.statusText}`);
        } else {
          queued.push(stagedFiles[i].name);
        }
      } catch {
        errors.push(`${stagedFiles[i].name}: Cannot reach backend (is it running on port 3000?)`);
      }

      setPdfProgress({ done: i + 1, total: stagedFiles.length });
    }

    setStagedFiles([]);
    setPdfWarning("");
    setPdfProgress(null);
    setUploadingPdf(false);
    onUploadComplete(queued);

    if (errors.length > 0) {
      setPdfError(errors.join(" | "));
    }
  };

  // ──────────────────────────────
  // CSV Actions
  // ──────────────────────────────
  const handleCsvSelect = (file: File | null) => {
    setCsvError("");
    setCsvResult(null);
    setPreviewData(null);
    if (!file) {
      setStagedCsvFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setCsvError("Only CSV (.csv) files are accepted.");
      return;
    }
    if (file.size > MAX_CSV_SIZE) {
      setCsvError("CSV file exceeds 20 MB limit.");
      return;
    }
    setStagedCsvFile(file);
  };

  const handleDownloadFailedRows = () => {
    if (!csvResult || csvResult.failed_rows.length === 0) return;

    const headers = [...CSV_TEMPLATE_HEADERS, "rejection_reason"];
    const rows = csvResult.failed_rows.map((failed) => {
      const data = failed.row_data ?? {};
      const rowValues = CSV_TEMPLATE_HEADERS.map((h) => data[h] ?? "");
      return [...rowValues, failed.reason].map(escapeCsvCell).join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `failed_invoices_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Direct Template Upload
  const handleDirectCsvUpload = async () => {
    if (!currentOrg || !session?.access_token || !stagedCsvFile) return;

    setUploadingCsv(true);
    setCsvError("");
    setCsvResult(null);

    const formData = new FormData();
    formData.append("file", stagedCsvFile);
    if (user?.id) formData.append("uploaded_by_user_id", user.id);

    try {
      const res = await fetch("/api/v1/invoices/bulk-import", {
        method: "POST",
        headers: {
          "x-org-id": currentOrg.id,
          Authorization: `Bearer ${session.access_token}`
        },
        body: formData
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCsvError(body?.message ?? `Upload failed (${res.status} ${res.statusText})`);
      } else {
        setCsvResult(body as CsvBulkImportResult);
        onUploadComplete([stagedCsvFile.name]);
      }
    } catch {
      setCsvError("Cannot reach backend server. Please verify connection.");
    } finally {
      setUploadingCsv(false);
    }
  };

  // Launch Column Mapping Preview
  const handleLaunchMappingPreview = async () => {
    if (!currentOrg || !session?.access_token || !stagedCsvFile) return;

    setPreviewingCsv(true);
    setCsvError("");
    setCsvResult(null);

    const formData = new FormData();
    formData.append("file", stagedCsvFile);
    if (user?.id) formData.append("uploaded_by_user_id", user.id);

    try {
      const res = await fetch("/api/v1/invoices/bulk-import/preview", {
        method: "POST",
        headers: {
          "x-org-id": currentOrg.id,
          Authorization: `Bearer ${session.access_token}`
        },
        body: formData
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCsvError(body?.message ?? `Preview failed (${res.status} ${res.statusText})`);
      } else {
        setPreviewData({
          upload_id: body.upload_id,
          fileName: stagedCsvFile.name,
          detected_columns: body.detected_columns,
          sample_rows: body.sample_rows,
          suggested_mapping: body.suggested_mapping
        });
        setMappingModalOpen(true);
      }
    } catch {
      setCsvError("Cannot reach backend server to preview CSV.");
    } finally {
      setPreviewingCsv(false);
    }
  };

  // Confirm Mapped Import
  const handleConfirmMappedImport = async (
    columnMapping: Record<string, string | null>,
    savePresetName?: string
  ) => {
    if (!currentOrg || !session?.access_token || !previewData) return;

    setConfirmingCsv(true);
    try {
      const res = await fetch("/api/v1/invoices/bulk-import/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": currentOrg.id,
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          upload_id: previewData.upload_id,
          column_mapping: columnMapping,
          save_mapping_as: savePresetName,
          uploaded_by_user_id: user?.id
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCsvError(body?.message ?? `Confirm import failed (${res.status} ${res.statusText})`);
      } else {
        setCsvResult(body as CsvBulkImportResult);
        setMappingModalOpen(false);
        setStagedCsvFile(null);
        setPreviewData(null);
        onUploadComplete([previewData.fileName]);

        // Refresh saved presets if a new preset was saved
        if (savePresetName) {
          fetch("/api/v1/invoices/bulk-import/saved-mappings", {
            headers: {
              "x-org-id": currentOrg.id,
              Authorization: `Bearer ${session.access_token}`
            }
          })
            .then((r) => r.json())
            .then((d) => setSavedPresets(d))
            .catch(() => {});
        }
      }
    } catch {
      setCsvError("Network error while confirming import.");
    } finally {
      setConfirmingCsv(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Invoice Intake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="pdf" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pdf" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <FileText className="h-4 w-4" />
                PDF Upload
              </TabsTrigger>
              <TabsTrigger value="csv" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <FileSpreadsheet className="h-4 w-4" />
                CSV Bulk Import
              </TabsTrigger>
            </TabsList>

            {/* ──────────────────────── PDF TAB ──────────────────────── */}
            <TabsContent value="pdf" className="space-y-4 pt-3">
              <div
                onDragOver={(e) => { e.preventDefault(); setPdfDragOver(true); }}
                onDragLeave={() => setPdfDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPdfDragOver(false);
                  if (e.dataTransfer.files.length) addPdfFiles(e.dataTransfer.files);
                }}
                onClick={() => pdfInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  pdfDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Drag & drop PDF invoices here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF only — max 15 MB per file, up to {MAX_PDF_FILES} files
                </p>
                <input
                  ref={pdfInputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addPdfFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              {pdfError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{pdfError}</span>
                </div>
              )}

              {pdfWarning && (
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  {pdfWarning}
                </div>
              )}

              {stagedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} staged
                    {pdfProgress && ` — ${pdfProgress.done}/${pdfProgress.total} sent`}
                  </p>
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {stagedFiles.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {uploadingPdf && pdfProgress && i < pdfProgress.done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                          ) : uploadingPdf ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : null}
                          <span className="truncate">{f.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
                        </div>
                        {!uploadingPdf && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removePdfFile(i); }}
                            className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button onClick={handlePdfUpload} disabled={uploadingPdf} className="w-full">
                    {uploadingPdf ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing {pdfProgress?.done ?? 0}/{pdfProgress?.total ?? stagedFiles.length}…
                      </>
                    ) : (
                      `Submit ${stagedFiles.length} PDF Invoice${stagedFiles.length > 1 ? "s" : ""}`
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ──────────────────────── CSV TAB ──────────────────────── */}
            <TabsContent value="csv" className="space-y-4 pt-3">
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-xs">
                <span className="text-muted-foreground">Standard or custom column formats</span>
                <a
                  href="/samples/invoice-csv-field-guide.pdf"
                  download
                  className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium text-primary hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Field Guide (PDF)
                </a>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
                onDragLeave={() => setCsvDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setCsvDragOver(false);
                  if (e.dataTransfer.files.length) handleCsvSelect(e.dataTransfer.files[0]);
                }}
                onClick={() => csvInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  csvDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Drag & drop CSV invoice batch here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  CSV only — up to 5,000 rows, max 20 MB
                </p>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleCsvSelect(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              {csvError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              {stagedCsvFile && (
                <div className="space-y-3 rounded-md border bg-card p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 truncate">
                      <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium truncate">{stagedCsvFile.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(stagedCsvFile.size)}</span>
                    </div>
                    {!uploadingCsv && !previewingCsv && (
                      <button
                        onClick={() => handleCsvSelect(null)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {/* Option 1: Map Columns (Recommended for custom ERP/Accounting CSVs) */}
                    <Button
                      onClick={handleLaunchMappingPreview}
                      disabled={uploadingCsv || previewingCsv}
                      className="w-full text-xs gap-1.5"
                    >
                      {previewingCsv ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Analyzing CSV...
                        </>
                      ) : (
                        <>
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Map Columns & Import
                        </>
                      )}
                    </Button>

                    {/* Option 2: Direct Template Import */}
                    <Button
                      variant="outline"
                      onClick={handleDirectCsvUpload}
                      disabled={uploadingCsv || previewingCsv}
                      className="w-full text-xs gap-1.5"
                    >
                      {uploadingCsv ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Direct Template Import
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── CSV Result Summary ── */}
              {csvResult && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-semibold text-xs uppercase tracking-wide text-foreground">Import Summary</span>
                    <div className="flex gap-2">
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        {csvResult.success_count} Imported
                      </Badge>
                      {csvResult.failed_count > 0 && (
                        <Badge className="bg-red-100 text-red-800 border-red-200">
                          {csvResult.failed_count} Failed
                        </Badge>
                      )}
                    </div>
                  </div>

                  {csvResult.failed_count > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Failed Rows Details
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 text-xs px-2 gap-1"
                          onClick={handleDownloadFailedRows}
                        >
                          <Download className="h-3 w-3" />
                          Download Failed CSV
                        </Button>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {csvResult.failed_rows.map((fr, idx) => (
                          <div
                            key={idx}
                            className="rounded bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive flex items-start gap-1.5"
                          >
                            <span className="font-bold shrink-0">Row {fr.row_number}:</span>
                            <span className="break-all">{fr.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Interactive Column Mapping Modal ── */}
      <ColumnMappingModal
        open={mappingModalOpen}
        onOpenChange={setMappingModalOpen}
        previewData={previewData}
        savedPresets={savedPresets}
        onConfirm={handleConfirmMappedImport}
        confirming={confirmingCsv}
      />
    </>
  );
}