import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, DollarSign, AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import type { Tables, Json } from "@/integrations/supabase/types";

interface Props {
  invoice: Tables<"invoices"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdate?: (inv: Tables<"invoices">, newStatus: string) => void;
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function formatShortDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

const statusStyles: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700 border-slate-200",
  extracted: "bg-sky-100 text-sky-800 border-sky-200",
  pending_match: "bg-orange-100 text-orange-800 border-orange-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-200",
  mismatch: "bg-red-100 text-red-800 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  processed: "bg-green-100 text-green-800 border-green-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  paid: "bg-purple-100 text-purple-800 border-purple-200",
  flagged: "bg-yellow-100 text-yellow-800 border-yellow-200",
  duplicate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  failed: "bg-red-100 text-red-800 border-red-200",
};

const fbrStyles: Record<string, string> = {
  Active: "bg-green-100 text-green-800 border-green-200",
  Suspended: "bg-red-100 text-red-800 border-red-200",
  Unregistered: "bg-gray-100 text-gray-800 border-gray-200",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function getMatchDetails(matchResult: Json | null): { mismatch: string[]; pending: string[] } {
  if (!matchResult || typeof matchResult !== "object" || Array.isArray(matchResult)) {
    return { mismatch: [], pending: [] };
  }
  const r = matchResult as Record<string, unknown>;
  const mismatch = Array.isArray(r.mismatch_reasons) ? (r.mismatch_reasons as string[]) : [];
  const pending = Array.isArray(r.pending_reasons) ? (r.pending_reasons as string[]) : [];
  return { mismatch, pending };
}

export default function InvoiceDetailModal({ invoice, open, onOpenChange, onStatusUpdate }: Props) {
  if (!invoice) return null;

  const { mismatch: mismatchReasons, pending: pendingReasons } = getMatchDetails(invoice.match_result);
  const displayName = invoice.source_file_name ?? invoice.file_name ?? "Unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Invoice Details
            <Badge variant="outline" className={`text-xs capitalize ${statusStyles[invoice.status] ?? ""}`}>
              {invoice.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File info */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="File" value={displayName} />
            <Field label="File Size" value={formatFileSize(invoice.file_size)} />
          </div>

          <Separator />

          {/* Invoice metadata */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice #" value={invoice.invoice_number} />
            <Field label="PO Number" value={invoice.po_number} />
            <Field label="GRN Number" value={invoice.grn_number} />
            <Field label="Payment Terms" value={invoice.payment_terms} />
            <Field label="Invoice Date" value={formatShortDate(invoice.invoice_date)} />
            <Field label="Due Date" value={formatShortDate(invoice.due_date)} />
          </div>

          <Separator />

          {/* Vendor */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vendor" value={invoice.vendor_name} />
            <Field label="Vendor NTN" value={invoice.vendor_ntn} />
          </div>

          {/* FBR status */}
          {invoice.fbr_status && (
            <div>
              <p className="text-xs text-muted-foreground">FBR Status</p>
              <Badge variant="outline" className={`text-xs ${fbrStyles[invoice.fbr_status] ?? ""}`}>
                {invoice.fbr_status}
              </Badge>
            </div>
          )}

          <Separator />

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Subtotal" value={invoice.subtotal != null ? `${invoice.currency ?? "PKR"} ${Number(invoice.subtotal).toLocaleString()}` : null} />
            <Field label="Tax" value={invoice.tax_amount != null ? `${invoice.currency ?? "PKR"} ${Number(invoice.tax_amount).toLocaleString()}` : null} />
            <Field label="Total" value={invoice.total_amount != null ? `${invoice.currency ?? "PKR"} ${Number(invoice.total_amount).toLocaleString()}` : null} />
          </div>

          <Separator />

          {/* Match */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Match Status</p>
              {invoice.match_status && (
                <Badge variant="outline" className={`text-xs capitalize ${
                  invoice.match_status === "matched"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : invoice.match_status === "pending"
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-red-100 text-red-800 border-red-200"
                }`}>
                  {invoice.match_status}
                </Badge>
              )}
            </div>
            {mismatchReasons.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-100 p-2 space-y-1">
                {mismatchReasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-red-800">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {reason}
                  </div>
                ))}
              </div>
            )}
            {pendingReasons.length > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-100 p-2 space-y-1">
                {pendingReasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
                    <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                    {reason}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uploaded" value={formatDate(invoice.uploaded_at ?? invoice.created_at)} />
            {invoice.updated_at && <Field label="Updated" value={formatDate(invoice.updated_at)} />}
          </div>

          {onStatusUpdate && (
            <div className="flex gap-2 pt-2 border-t">
              {invoice.status === "pending_review" && (
                <Button
                  variant="outline"
                  className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => { onStatusUpdate(invoice, "approved"); onOpenChange(false); }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" /> Approve
                </Button>
              )}
              {(invoice.status === "mismatch" || invoice.status === "pending") && (
                <Button
                  variant="outline"
                  className="flex-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                  onClick={() => { onStatusUpdate(invoice, "approved"); onOpenChange(false); }}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Approve Override
                </Button>
              )}
              {invoice.status === "approved" && (
                <Button
                  variant="outline"
                  className="flex-1 border-purple-200 text-purple-700 hover:bg-purple-50"
                  onClick={() => { onStatusUpdate(invoice, "paid"); onOpenChange(false); }}
                >
                  <DollarSign className="mr-2 h-4 w-4" /> Mark as Paid
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}