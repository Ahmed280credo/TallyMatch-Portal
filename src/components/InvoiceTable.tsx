import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Trash2, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, DollarSign, Loader2, ShieldCheck } from "lucide-react";
import InvoiceDetailModal from "./InvoiceDetailModal";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  paid: "bg-purple-100 text-purple-800 border-purple-200",
  flagged: "bg-yellow-100 text-yellow-800 border-yellow-200",
  duplicate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
};

const STATUSES = ["All", "queued", "extracted", "pending_match", "pending_review", "mismatch", "approved", "processed", "paid", "flagged", "duplicate", "failed", "pending"];

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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File / Invoice</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingFiles.map((fileName) => (
                    <TableRow key={`pending-${fileName}`} className="bg-primary/5">
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
                      <TableCell />
                    </TableRow>
                  ))}
                  {invoices.map((inv) => {
                    const displayName = inv.source_file_name ?? inv.file_name ?? "Unknown";
                    const isDuplicate = inv.status === "duplicate" || inv.status === "flagged";
                    return (
                      <TableRow key={inv.id}>
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
                          <Badge variant="outline" className={`capitalize ${statusStyles[inv.status] ?? ""}`}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{displayDate(inv.uploaded_at ?? inv.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {inv.status === "pending_review" && (
                              <Button variant="ghost" size="icon" title="Approve"
                                onClick={() => handleStatusUpdate(inv, "approved")}>
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            {(inv.status === "mismatch" || inv.status === "pending") && (
                              <Button variant="ghost" size="icon" title="Approve Override"
                                onClick={() => handleStatusUpdate(inv, "approved")}>
                                <ShieldCheck className="h-4 w-4 text-orange-600" />
                              </Button>
                            )}
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
    </>
  );
}