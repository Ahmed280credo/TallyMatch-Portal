import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useAuth } from "@/hooks/useAuth";
import { apiUrl } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Trash2, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, DollarSign, Loader2, MoreVertical, CheckSquare, Square, Cloud, CloudOff, RefreshCw } from "lucide-react";
import InvoiceDetailModal from "./InvoiceDetailModal";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const PAGE_SIZE = 10;

const statusStyles: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700 border-slate-200",
  extracted: "bg-sky-100 text-sky-800 border-sky-200",
  pending_match: "bg-orange-100 text-orange-800 border-orange-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-200",
  mismatch: "bg-red-100 text-red-800 border-red-200",
  processed: "bg-green-100 text-green-800 border-green-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  queued_for_payment: "bg-indigo-100 text-indigo-800 border-indigo-200",
  payment_processing: "bg-cyan-100 text-cyan-800 border-cyan-200",
  paid: "bg-purple-100 text-purple-800 border-purple-200",
  flagged: "bg-yellow-100 text-yellow-800 border-yellow-200",
  duplicate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
};

const STATUSES = ["All", "queued", "extracted", "pending_match", "pending_review", "mismatch", "approved", "queued_for_payment", "payment_processing", "processed", "paid", "flagged", "duplicate", "failed", "pending"];

// "ERP" is generic on purpose — erp_type ("sap_b1" today) drives the label,
// so a second ERP later doesn't need a new badge variant.
function ErpPushBadge({ invoice }: { invoice: Tables<"invoices"> }) {
  const label = invoice.erp_type === "sap_b1" ? "SAP B1" : (invoice.erp_type ?? "ERP");

  if (invoice.erp_push_status === "pushed") {
    return (
      <Badge variant="outline" className="gap-1 border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px]">
        <Cloud className="h-3 w-3" /> {label} #{invoice.erp_doc_num}
      </Badge>
    );
  }
  if (invoice.erp_push_status === "failed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-red-200 bg-red-50 text-red-700 text-[10px] max-w-[180px] truncate"
        title={invoice.erp_push_error ?? undefined}
      >
        <CloudOff className="h-3 w-3 shrink-0" /> Push failed
      </Badge>
    );
  }
  return null;
}

function displayDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

interface InvoiceTableProps {
  refreshKey: number;
  pendingFiles?: string[];
  onFilesSettled?: (names: string[]) => void;
}

interface DeleteWebhookResult {
  ok?: boolean;
  externalStatus?: number;
}

export default function InvoiceTable({ refreshKey, pendingFiles = [], onFilesSettled }: InvoiceTableProps) {
  const { currentOrg } = useCurrentOrg();
  const { session } = useAuth();
  const onFilesSettledRef = useRef(onFilesSettled);
  useEffect(() => { onFilesSettledRef.current = onFilesSettled; }, [onFilesSettled]);

  const [invoices, setInvoices] = useState<Tables<"invoices">[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Tables<"invoices"> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteInvoice, setDeleteInvoice] = useState<Tables<"invoices"> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);
  const [erpActingId, setErpActingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    let query = supabase
      .from("invoices")
      .select("*", { count: "exact" })
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== "All") {
      query = query.eq("status", statusFilter);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("Fetch error:", error);
    } else if (data) {
      setInvoices(data);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [currentOrg, page, statusFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices, refreshKey]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchInvoices();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchInvoices]);

  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase
      .channel("invoices-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "invoices",
        filter: `org_id=eq.${currentOrg.id}`,
      }, () => fetchInvoices())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg, fetchInvoices]);

  useEffect(() => {
    if (pendingFiles.length === 0) return;
    const settled = pendingFiles.filter((name) =>
      invoices.some((inv) => inv.source_file_name === name)
    );
    if (settled.length > 0) onFilesSettledRef.current?.(settled);
  }, [invoices, pendingFiles]);

  useEffect(() => { setPage(0); }, [statusFilter]);

  useEffect(() => { setSelectedIds(new Set()); setSelectMode(false); }, [page, statusFilter, refreshKey]);

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterSelectModeWith = (id: string) => {
    setSelectMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(invoices.map((inv) => inv.id)));
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };
  const toggleSelectAllCheckbox = () => {
    if (selectedIds.size === invoices.length) clearSelection();
    else selectAll();
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const targets = invoices.filter((inv) => selectedIds.has(inv.id));

    setBulkActing(true);
    const { error } = await supabase.from("invoices").update({ status: "approved" }).in("id", ids);
    setBulkActing(false);

    if (error) {
      toast.error("Failed to approve selected invoices");
      return;
    }

    await supabase.from("invoice_audit_log").insert(
      targets.map((inv) => ({
        org_id: inv.org_id,
        invoice_id: inv.id,
        invoice_number: inv.invoice_number ?? null,
        vendor_name: inv.vendor_name ?? null,
        event: "APPROVED",
        status: "approved",
        total_amount: inv.total_amount ?? null,
        currency: inv.currency ?? "PKR",
        source: "manual",
        processed_at: new Date().toISOString(),
      }))
    );

    toast.success(`${ids.length} invoice${ids.length > 1 ? "s" : ""} approved`);
    setInvoices((prev) => prev.map((i) => (selectedIds.has(i.id) ? { ...i, status: "approved" } : i)));
    clearSelection();
  };

  const handleBulkDelete = async () => {
    if (!currentOrg) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const targets = invoices.filter((inv) => selectedIds.has(inv.id));

    setBulkActing(true);
    const { error } = await supabase.from("invoices").delete().in("id", ids);
    setBulkActing(false);
    setBulkDeleteOpen(false);

    if (error) {
      toast.error("Failed to delete selected invoices");
      return;
    }

    toast.success(`${ids.length} invoice${ids.length > 1 ? "s" : ""} deleted`);
    setInvoices((prev) => prev.filter((inv) => !selectedIds.has(inv.id)));
    setTotal((prev) => Math.max(0, prev - ids.length));
    clearSelection();

    for (const inv of targets) {
      try {
        const rawInvoiceNumber = inv.invoice_number ?? inv.file_name ?? "";
        const match = rawInvoiceNumber.match(/(\d+)(?:\.pdf)?$/i);
        const invoiceNumberToSend = match ? match[1] : rawInvoiceNumber;
        await supabase.functions.invoke<DeleteWebhookResult>("delete-invoice-webhook", {
          body: { invoice_number: invoiceNumberToSend, org_id: currentOrg.id },
        });
      } catch {
        // best-effort external notification; invoice is already deleted
      }
    }
  };

  const handleStatusUpdate = async (inv: Tables<"invoices">, newStatus: string) => {
    const { error } = await supabase
      .from("invoices")
      .update({ status: newStatus })
      .eq("id", inv.id);

    if (error) {
      toast.error("Failed to update status");
      return;
    }

    await supabase.from("invoice_audit_log").insert({
      org_id: inv.org_id,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number ?? null,
      vendor_name: inv.vendor_name ?? null,
      event: "APPROVED",
      status: newStatus,
      total_amount: inv.total_amount ?? null,
      currency: inv.currency ?? "PKR",
      source: "manual",
      processed_at: new Date().toISOString(),
    });

    toast.success(`Invoice marked as ${newStatus}`);
    setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: newStatus } : i)));
    if (selectedInvoice?.id === inv.id) {
      setSelectedInvoice({ ...inv, status: newStatus });
    }
  };

  const erpAuthHeaders = (): Record<string, string> => {
    if (!session?.access_token || !currentOrg) return {};
    return { Authorization: `Bearer ${session.access_token}`, "x-org-id": currentOrg.id };
  };

  const handlePushToErp = async (inv: Tables<"invoices">) => {
    setErpActingId(inv.id);
    try {
      const res = await fetch(apiUrl(`/api/v1/invoices/${inv.id}/push-to-erp`), {
        method: "POST",
        headers: erpAuthHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The connector's actual error.code/error.message is surfaced here,
        // never a generic failure — the row's badge will also show it.
        toast.error(body?.message ?? "Push to SAP B1 failed");
      } else {
        toast.success(`Pushed to SAP B1 as DocNum ${body.erp_doc_num}`);
      }
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, ...body } : i)));
      if (selectedInvoice?.id === inv.id) setSelectedInvoice((prev) => (prev ? { ...prev, ...body } : prev));
    } catch {
      toast.error("Network error while pushing to SAP B1");
    } finally {
      setErpActingId(null);
    }
  };

  const handleSyncErpPayment = async (inv: Tables<"invoices">) => {
    setErpActingId(inv.id);
    try {
      const res = await fetch(apiUrl(`/api/v1/invoices/${inv.id}/sync-erp-payment-status`), {
        method: "POST",
        headers: erpAuthHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? "Failed to sync payment status");
      } else {
        toast.success(body.status === "paid" ? "Marked paid via SAP B1 sync" : "Still unpaid in SAP B1");
      }
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, ...body } : i)));
      if (selectedInvoice?.id === inv.id) setSelectedInvoice((prev) => (prev ? { ...prev, ...body } : prev));
    } catch {
      toast.error("Network error while syncing payment status");
    } finally {
      setErpActingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteInvoice || !currentOrg) return;
    const { error } = await supabase.from("invoices").delete().eq("id", deleteInvoice.id);
    if (!error) {
      toast.success("Invoice deleted successfully");
      setInvoices((prev) => prev.filter((inv) => inv.id !== deleteInvoice.id));
      setTotal((prev) => prev - 1);

      try {
        const rawInvoiceNumber = deleteInvoice.invoice_number ?? deleteInvoice.file_name ?? "";
        const match = rawInvoiceNumber.match(/(\d+)(?:\.pdf)?$/i);
        const invoiceNumberToSend = match ? match[1] : rawInvoiceNumber;

        const { data: webhookResult, error: webhookError } = await supabase.functions.invoke<DeleteWebhookResult>(
          "delete-invoice-webhook",
          { body: { invoice_number: invoiceNumberToSend, org_id: currentOrg.id } },
        );

        if (webhookError) {
          toast.warning("Invoice deleted, but the external service could not be reached");
        } else if (webhookResult?.ok === false) {
          toast.warning(
            webhookResult.externalStatus === 404
              ? "Invoice deleted, but the external workflow is inactive"
              : "Invoice deleted, but the external service did not accept the request",
          );
        }
      } catch {
        toast.warning("Invoice deleted, but the external service could not be reached");
      }
    } else {
      toast.error("Failed to delete invoice");
    }
    setDeleteInvoice(null);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Your Invoices</CardTitle>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm capitalize ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : invoices.length === 0 && pendingFiles.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No invoices found. Upload some files to get started.
            </p>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="mb-3 flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                  <span className="text-sm font-medium">
                    {selectedIds.size} invoice{selectedIds.size > 1 ? "s" : ""} selected
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={bulkActing || selectedIds.size === invoices.length} onClick={selectAll}>
                      <CheckSquare className="mr-1.5 h-4 w-4" />
                      Select All
                    </Button>
                    <Button size="sm" variant="outline" disabled={bulkActing} onClick={handleBulkApprove}>
                      <CheckCircle className="mr-1.5 h-4 w-4 text-blue-600" />
                      Approve Selected
                    </Button>
                    <Button size="sm" variant="destructive" disabled={bulkActing} onClick={() => setBulkDeleteOpen(true)}>
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Delete Selected
                    </Button>
                    <Button size="sm" variant="ghost" disabled={bulkActing} onClick={clearSelection}>
                      <Square className="mr-1.5 h-4 w-4" />
                      Deselect All
                    </Button>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectMode && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            invoices.length > 0 && selectedIds.size === invoices.length
                              ? true
                              : selectedIds.size > 0
                              ? "indeterminate"
                              : false
                          }
                          onCheckedChange={toggleSelectAllCheckbox}
                          aria-label="Select all invoices"
                        />
                      </TableHead>
                    )}
                    <TableHead>File / Invoice</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="sticky right-0 z-10 border-l bg-card text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingFiles.map((fileName) => (
                    <TableRow key={`pending-${fileName}`} className="bg-primary/5">
                      {selectMode && <TableCell />}
                      <TableCell className="max-w-[200px] font-medium">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          <span className="truncate text-sm">{fileName}</span>
                        </div>
                      </TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          Processing…
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">just now</TableCell>
                      <TableCell className="sticky right-0 border-l bg-primary/5" />
                    </TableRow>
                  ))}
                  {invoices.map((inv) => {
                    const displayName = inv.source_file_name ?? inv.file_name ?? "Unknown";
                    const isDuplicate = inv.status === "duplicate" || inv.status === "flagged";
                    const isSelected = selectedIds.has(inv.id);
                    return (
                      <TableRow key={inv.id} data-state={isSelected ? "selected" : undefined}>
                        {selectMode && (
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectOne(inv.id)}
                              aria-label={`Select invoice ${inv.invoice_number ?? displayName}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="max-w-[200px] font-medium">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{displayName}</span>
                            {isDuplicate && (
                              <Badge variant="outline" className="shrink-0 border-yellow-200 bg-yellow-100 text-yellow-800">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Dup
                              </Badge>
                            )}
                          </div>
                          {inv.invoice_number && (
                            <p className="truncate text-xs text-muted-foreground">#{inv.invoice_number}</p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[140px]">
                          <span className="truncate block">{inv.vendor_name ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          {inv.total_amount != null
                            ? `${inv.currency ?? "PKR"} ${Number(inv.total_amount).toLocaleString()}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="outline" className={`capitalize ${statusStyles[inv.status] ?? ""}`}>
                              {inv.status === "paid"
                                ? inv.payment_source === "erp_sync" ? "Paid (SAP B1)" : "Paid (Manual)"
                                : inv.status}
                            </Badge>
                            <ErpPushBadge invoice={inv} />
                          </div>
                        </TableCell>
                        <TableCell>{displayDate(inv.uploaded_at ?? inv.created_at)}</TableCell>
                        <TableCell
                          className={`sticky right-0 border-l text-right ${isSelected ? "bg-muted" : "bg-card"}`}
                        >
                          <div className="flex justify-end gap-1">
                            {inv.status === "approved" && (
                              <Button variant="ghost" size="icon" title="Mark as Paid"
                                onClick={() => handleStatusUpdate(inv, "paid")}>
                                <DollarSign className="h-4 w-4 text-purple-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon"
                              onClick={() => { setSelectedInvoice(inv); setModalOpen(true); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              onClick={() => setDeleteInvoice(inv)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className={isSelected ? "bg-primary/10" : ""}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => (selectMode ? toggleSelectOne(inv.id) : enterSelectModeWith(inv.id))}>
                                  {isSelected ? (
                                    <>
                                      <CheckSquare className="mr-2 h-4 w-4" />
                                      Deselect
                                    </>
                                  ) : (
                                    <>
                                      <Square className="mr-2 h-4 w-4" />
                                      Select
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusUpdate(inv, "approved")}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-blue-600" />
                                  Approve
                                </DropdownMenuItem>
                                {(inv.erp_push_status === "not_pushed" || inv.erp_push_status === "failed") && (
                                  <DropdownMenuItem disabled={erpActingId === inv.id} onClick={() => handlePushToErp(inv)}>
                                    {erpActingId === inv.id
                                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      : <Cloud className="mr-2 h-4 w-4 text-indigo-600" />}
                                    {inv.erp_push_status === "failed" ? "Retry Push to SAP B1" : "Push to SAP B1"}
                                  </DropdownMenuItem>
                                )}
                                {inv.erp_push_status === "pushed" && inv.status !== "paid" && (
                                  <DropdownMenuItem disabled={erpActingId === inv.id} onClick={() => handleSyncErpPayment(inv)}>
                                    {erpActingId === inv.id
                                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      : <RefreshCw className="mr-2 h-4 w-4 text-indigo-600" />}
                                    Sync Payment Status
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setDeleteInvoice(inv)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages} ({total} total)
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <InvoiceDetailModal
        invoice={selectedInvoice}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onStatusUpdate={handleStatusUpdate}
        onPushToErp={handlePushToErp}
        onSyncErpPayment={handleSyncErpPayment}
        erpActing={selectedInvoice != null && erpActingId === selectedInvoice.id}
      />

      <AlertDialog open={!!deleteInvoice} onOpenChange={(open) => { if (!open) setDeleteInvoice(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Invoice{selectedIds.size > 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected invoice{selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}