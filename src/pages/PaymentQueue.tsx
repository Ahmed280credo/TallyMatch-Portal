import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { supabase } from "@/integrations/supabase/client";
import { apiUrl } from "@/lib/api";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Download, AlertCircle, CreditCard, ChevronLeft, ChevronRight, FileCheck2, Eye, FileX2,
} from "lucide-react";

const PAGE_SIZE = 20;

interface QueueInvoice {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  currency: string | null;
  due_date: string | null;
  po_number: string | null;
  vendor_bank_name: string | null;
  vendor_account_number: string | null;
  vendor_iban: string | null;
  is_overdue: boolean;
}

interface ProcessingInvoice {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  currency: string | null;
  due_date: string | null;
}

interface PaymentRunRow {
  id: string;
  created_at: string;
  total_amount: number;
  invoice_count: number;
  status: "paid" | "partially_paid" | "pending";
}

interface PaymentRunInvoice {
  id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  currency: string | null;
  status: string;
  transaction_reference: string | null;
  payment_date: string | null;
  amount_paid: number | null;
  payment_amount_mismatch: boolean;
  proof_of_payment_url: string | null;
}

const runStatusStyles: Record<string, string> = {
  paid: "bg-purple-100 text-purple-800 border-purple-200",
  partially_paid: "bg-amber-100 text-amber-800 border-amber-200",
  pending: "bg-orange-100 text-orange-800 border-orange-200",
};

function formatAmount(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  return `${currency ?? "PKR"} ${Number(amount).toLocaleString()}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PaymentQueue() {
  const { user, session, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useCurrentOrg();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  const authHeaders = useCallback((): Record<string, string> => {
    if (!session?.access_token || !currentOrg) return {};
    return {
      Authorization: `Bearer ${session.access_token}`,
      "x-org-id": currentOrg.id,
    };
  }, [session, currentOrg]);

  // ── Queue tab ──
  const [queue, setQueue] = useState<QueueInvoice[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queuePage, setQueuePage] = useState(1);
  const [sortBy, setSortBy] = useState<"due_date" | "vendor_name" | "amount">("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [vendorFilter, setVendorFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creatingRun, setCreatingRun] = useState(false);

  const fetchQueue = useCallback(async () => {
    if (!currentOrg || !session?.access_token) return;
    setQueueLoading(true);
    try {
      const params = new URLSearchParams({
        sort_by: sortBy,
        sort_dir: sortDir,
        page: String(queuePage),
        page_size: String(PAGE_SIZE),
      });
      if (vendorFilter.trim()) params.set("vendor_name", vendorFilter.trim());

      const res = await fetch(apiUrl(`/api/v1/invoices/payment-queue?${params.toString()}`), {
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? "Failed to load payment queue");
        setQueue([]);
        setQueueTotal(0);
      } else {
        setQueue(body.invoices ?? []);
        setQueueTotal(body.total ?? 0);
      }
    } catch {
      toast.error("Cannot reach backend server for payment queue");
    } finally {
      setQueueLoading(false);
    }
  }, [currentOrg, session?.access_token, sortBy, sortDir, queuePage, vendorFilter, authHeaders]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const allSelected = queue.every((inv) => prev.has(inv.id));
      if (allSelected) {
        const next = new Set(prev);
        queue.forEach((inv) => next.delete(inv.id));
        return next;
      }
      const next = new Set(prev);
      queue.forEach((inv) => next.add(inv.id));
      return next;
    });
  };

  const handleCreatePaymentRun = async () => {
    if (!currentOrg || selectedIds.size === 0) return;
    setCreatingRun(true);
    try {
      const res = await fetch(apiUrl("/api/v1/invoices/payment-run"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ invoice_ids: Array.from(selectedIds) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? "Failed to create payment run");
        return;
      }

      const blob = new Blob([body.csv ?? ""], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `payment-run-${body.payment_run_id}.csv`);

      toast.success(
        `Payment run created — ${body.invoice_count} invoice${body.invoice_count > 1 ? "s" : ""}, ${formatAmount(body.total_amount, "PKR")}. CSV downloaded.`
      );
      setSelectedIds(new Set());
      fetchQueue();
      fetchProcessing();
      fetchRuns();
    } catch {
      toast.error("Network error while creating payment run");
    } finally {
      setCreatingRun(false);
    }
  };

  // ── Awaiting Payment tab ──
  const [processing, setProcessing] = useState<ProcessingInvoice[]>([]);
  const [processingLoading, setProcessingLoading] = useState(true);
  const [markPaidTarget, setMarkPaidTarget] = useState<ProcessingInvoice | null>(null);

  const fetchProcessing = useCallback(async () => {
    if (!currentOrg) return;
    setProcessingLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, vendor_name, total_amount, currency, due_date")
      .eq("org_id", currentOrg.id)
      .eq("status", "payment_processing")
      .order("due_date", { ascending: true });

    if (!error && data) setProcessing(data as ProcessingInvoice[]);
    setProcessingLoading(false);
  }, [currentOrg]);

  useEffect(() => {
    fetchProcessing();
  }, [fetchProcessing]);

  // ── Payment Runs (history) tab ──
  const [runs, setRuns] = useState<PaymentRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!currentOrg || !session?.access_token) return;
    setRunsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/v1/invoices/payment-runs?page=1&page_size=50"), {
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setRuns(body.payment_runs ?? []);
    } catch {
      // silent — history is non-critical
    } finally {
      setRunsLoading(false);
    }
  }, [currentOrg, session?.access_token, authHeaders]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // ── Payment Run detail (proof of payment review) ──
  const [detailRun, setDetailRun] = useState<PaymentRunRow | null>(null);
  const [runInvoices, setRunInvoices] = useState<PaymentRunInvoice[]>([]);
  const [runInvoicesLoading, setRunInvoicesLoading] = useState(false);

  const handleViewRunDetail = async (run: PaymentRunRow) => {
    setDetailRun(run);
    setRunInvoicesLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/invoices/payment-runs/${run.id}/invoices`), {
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? "Failed to load payment run details");
        setRunInvoices([]);
        return;
      }
      setRunInvoices(body.invoices ?? []);
    } catch {
      toast.error("Network error while loading payment run details");
      setRunInvoices([]);
    } finally {
      setRunInvoicesLoading(false);
    }
  };

  const handleDownloadRunCsv = async (runId: string) => {
    setDownloadingRunId(runId);
    try {
      const res = await fetch(apiUrl(`/api/v1/invoices/payment-runs/${runId}/csv`), {
        headers: authHeaders(),
      });
      if (!res.ok) {
        toast.error("Failed to download payment run CSV");
        return;
      }
      const blob = await res.blob();
      downloadBlob(blob, `payment-run-${runId}.csv`);
    } catch {
      toast.error("Network error while downloading CSV");
    } finally {
      setDownloadingRunId(null);
    }
  };

  const isInitialLoading = authLoading || (orgLoading && !currentOrg);

  if (isInitialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const totalPages = Math.max(1, Math.ceil(queueTotal / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {!currentOrg ? (
          <p className="py-20 text-center text-sm text-muted-foreground">No organization selected.</p>
        ) : (
          <Tabs defaultValue="queue" className="w-full">
            <TabsList>
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="processing">
                Awaiting Payment
                {processing.length > 0 && (
                  <Badge variant="outline" className="ml-1.5 h-5 px-1.5 text-xs">{processing.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="runs">Payment Runs</TabsTrigger>
            </TabsList>

            {/* ──────────────────────── QUEUE TAB ──────────────────────── */}
            <TabsContent value="queue" className="pt-4">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
                  <CardTitle className="text-lg">Queued for Payment</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Filter by vendor…"
                      value={vendorFilter}
                      onChange={(e) => { setVendorFilter(e.target.value); setQueuePage(1); }}
                      className="h-8 w-40 text-sm"
                    />
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                      <SelectTrigger className="h-8 w-36 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="due_date">Due Date</SelectItem>
                        <SelectItem value="vendor_name">Vendor</SelectItem>
                        <SelectItem value="amount">Amount</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    >
                      {sortDir === "asc" ? "Ascending" : "Descending"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedIds.size > 0 && (
                    <div className="mb-3 flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                      <span className="text-sm font-medium">{selectedIds.size} invoice{selectedIds.size > 1 ? "s" : ""} selected</span>
                      <Button size="sm" onClick={handleCreatePaymentRun} disabled={creatingRun} className="gap-1.5">
                        {creatingRun ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                        Create Payment Run
                      </Button>
                    </div>
                  )}

                  {queueLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : queue.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No invoices queued for payment. Approve an invoice to see it here.
                    </p>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">
                              <Checkbox
                                checked={queue.length > 0 && queue.every((inv) => selectedIds.has(inv.id))}
                                onCheckedChange={toggleSelectAllOnPage}
                              />
                            </TableHead>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>PO #</TableHead>
                            <TableHead>Bank Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {queue.map((inv) => {
                            const hasBankDetails = !!(inv.vendor_bank_name || inv.vendor_account_number || inv.vendor_iban);
                            return (
                              <TableRow key={inv.id} className={inv.is_overdue ? "bg-red-50/50" : undefined}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIds.has(inv.id)}
                                    onCheckedChange={() => toggleSelect(inv.id)}
                                  />
                                </TableCell>
                                <TableCell className="font-semibold">{inv.invoice_number ?? "—"}</TableCell>
                                <TableCell>{inv.vendor_name ?? "—"}</TableCell>
                                <TableCell>{formatAmount(inv.total_amount, inv.currency)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    {inv.due_date ?? "—"}
                                    {inv.is_overdue && (
                                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                                        Overdue
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{inv.po_number ?? "—"}</TableCell>
                                <TableCell>
                                  {hasBankDetails ? (
                                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">On file</Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-xs gap-1">
                                      <AlertCircle className="h-3 w-3" /> Missing
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>

                      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                        <span>{queueTotal} total invoice{queueTotal !== 1 ? "s" : ""}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={queuePage <= 1}
                            onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span>Page {queuePage} of {totalPages}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={queuePage >= totalPages}
                            onClick={() => setQueuePage((p) => Math.min(totalPages, p + 1))}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ──────────────────────── AWAITING PAYMENT TAB ──────────────────────── */}
            <TabsContent value="processing" className="pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Awaiting Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  {processingLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : processing.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No invoices awaiting payment. Create a payment run from the Queue tab first.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processing.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-semibold">{inv.invoice_number ?? "—"}</TableCell>
                            <TableCell>{inv.vendor_name ?? "—"}</TableCell>
                            <TableCell>{formatAmount(inv.total_amount, inv.currency)}</TableCell>
                            <TableCell>{inv.due_date ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => setMarkPaidTarget(inv)}>
                                Mark Paid
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ──────────────────────── PAYMENT RUNS TAB ──────────────────────── */}
            <TabsContent value="runs" className="pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Payment Run History</CardTitle>
                </CardHeader>
                <CardContent>
                  {runsLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : runs.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No payment runs yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Created</TableHead>
                          <TableHead>Invoices</TableHead>
                          <TableHead>Total Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Proof</TableHead>
                          <TableHead className="text-right">CSV</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {new Date(run.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>{run.invoice_count}</TableCell>
                            <TableCell>{formatAmount(run.total_amount, "PKR")}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={runStatusStyles[run.status] ?? ""}>
                                {run.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-xs"
                                onClick={() => handleViewRunDetail(run)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Review proof
                              </Button>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={downloadingRunId === run.id}
                                onClick={() => handleDownloadRunCsv(run.id)}
                              >
                                {downloadingRunId === run.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>

      <MarkPaidDialog
        invoice={markPaidTarget}
        onClose={() => setMarkPaidTarget(null)}
        authHeaders={authHeaders()}
        onSuccess={() => {
          setMarkPaidTarget(null);
          fetchProcessing();
          fetchRuns();
        }}
      />

      <PaymentRunDetailDialog
        run={detailRun}
        invoices={runInvoices}
        loading={runInvoicesLoading}
        onClose={() => setDetailRun(null)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Payment Run Detail Dialog — review proof of payment per invoice
// ──────────────────────────────────────────────────────────────

interface PaymentRunDetailDialogProps {
  run: PaymentRunRow | null;
  invoices: PaymentRunInvoice[];
  loading: boolean;
  onClose: () => void;
}

function PaymentRunDetailDialog({ run, invoices, loading, onClose }: PaymentRunDetailDialogProps) {
  return (
    <Dialog open={!!run} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Payment Run Details</DialogTitle>
          <DialogDescription>
            {run
              ? `Created ${new Date(run.created_at).toLocaleString()} — ${run.invoice_count} invoice${run.invoice_count > 1 ? "s" : ""}, ${formatAmount(run.total_amount, "PKR")}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No invoices found for this payment run.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Txn Ref</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead className="text-right">Proof</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-semibold">{inv.invoice_number ?? "—"}</TableCell>
                    <TableCell>{inv.vendor_name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {formatAmount(inv.total_amount, inv.currency)}
                        {inv.payment_amount_mismatch && (
                          <Badge variant="outline" className="gap-1 border-red-200 bg-red-100 text-xs text-red-800">
                            <AlertCircle className="h-3 w-3" />
                            Paid {formatAmount(inv.amount_paid, inv.currency)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{inv.transaction_reference ?? "—"}</TableCell>
                    <TableCell className="text-sm">{inv.payment_date ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {inv.proof_of_payment_url ? (
                        <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                          <a href={inv.proof_of_payment_url} target="_blank" rel="noopener noreferrer">
                            <FileCheck2 className="h-3.5 w-3.5" />
                            View proof
                          </a>
                        </Button>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-100 text-xs text-amber-800">
                          <FileX2 className="h-3 w-3" />
                          No proof on file
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────
// Mark Paid Dialog
// ──────────────────────────────────────────────────────────────

interface MarkPaidDialogProps {
  invoice: ProcessingInvoice | null;
  onClose: () => void;
  authHeaders: Record<string, string>;
  onSuccess: () => void;
}

function MarkPaidDialog({ invoice, onClose, authHeaders, onSuccess }: MarkPaidDialogProps) {
  const [transactionRef, setTransactionRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amountPaid, setAmountPaid] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (invoice) {
      setTransactionRef("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setAmountPaid(invoice.total_amount != null ? String(invoice.total_amount) : "");
      setFile(null);
      setError("");
    }
  }, [invoice]);

  const handleSubmit = async () => {
    if (!invoice) return;
    if (!file) {
      setError("Attach a proof of payment file (PDF or image).");
      return;
    }
    if (!transactionRef.trim()) {
      setError("Transaction reference is required.");
      return;
    }
    if (!amountPaid || Number.isNaN(Number(amountPaid)) || Number(amountPaid) <= 0) {
      setError("Enter a valid amount paid.");
      return;
    }

    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.append("proof_of_payment", file);
    formData.append("transaction_reference", transactionRef.trim());
    formData.append("payment_date", paymentDate);
    formData.append("amount_paid", amountPaid);

    try {
      const res = await fetch(apiUrl(`/api/v1/invoices/${invoice.id}/mark-paid`), {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.message ?? `Failed to mark paid (${res.status})`);
        return;
      }
      if (body.payment_amount_mismatch) {
        toast.warning(`Invoice ${invoice.invoice_number} marked paid — amount paid differs from invoice total.`);
      } else {
        toast.success(`Invoice ${invoice.invoice_number} marked as paid.`);
      }
      onSuccess();
    } catch {
      setError("Network error while marking invoice paid.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Invoice Paid</DialogTitle>
          <DialogDescription>
            {invoice ? `${invoice.invoice_number ?? invoice.id} — ${invoice.vendor_name ?? "Unknown vendor"}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="proof-file">Proof of Payment (PDF or image)</Label>
            <Input
              id="proof-file"
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="txn-ref">Transaction Reference</Label>
            <Input
              id="txn-ref"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="e.g. bank transfer ref #"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Payment Date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount-paid">Amount Paid</Label>
              <Input
                id="amount-paid"
                type="number"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Mark as Paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
