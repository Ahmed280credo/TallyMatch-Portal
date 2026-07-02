import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, FileText, X, CheckCircle2, Upload, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type PurchaseOrder = Tables<"purchase_orders">;
type GoodsReceiptNote = Tables<"goods_receipt_notes">;

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  skipped_rows: { row_index: number; reason: string; data: Record<string, string> }[];
}

const EMPTY_PO = { po_number: "", vendor_name: "", total_amount: "", currency: "PKR" };
const EMPTY_GRN = { grn_number: "", po_number: "", vendor_name: "", total_received_amount: "", received_at: "" };

async function uploadFileToStorage(file: File, orgId: string): Promise<string | null> {
  const path = `${orgId}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (error) return null;
  const { data } = supabase.storage.from("documents").getPublicUrl(path);
  return data.publicUrl;
}

function ImportResultBanner({ result }: { result: ImportResult }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <div className="flex gap-2 flex-wrap">
          <Badge className="bg-green-100 text-green-800 border-green-200">{result.imported} imported</Badge>
          {result.skipped > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{result.skipped} skipped</Badge>
          )}
        </div>
      </div>
      {result.skipped_rows.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skipped rows</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {result.skipped_rows.map((r) => (
              <div key={r.row_index} className="flex items-start gap-2 text-xs rounded bg-yellow-50 border border-yellow-200 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-yellow-600 mt-0.5 shrink-0" />
                <span><span className="font-semibold">Row {r.row_index}:</span> {r.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  const { user, session, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useCurrentOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GoodsReceiptNote[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [poForm, setPoForm] = useState(EMPTY_PO);
  const [grnForm, setGrnForm] = useState(EMPTY_GRN);
  const [poFile, setPoFile] = useState<File | null>(null);
  const [grnFile, setGrnFile] = useState<File | null>(null);
  const [submittingPo, setSubmittingPo] = useState(false);
  const [submittingGrn, setSubmittingGrn] = useState(false);

  const [poCsvFile, setPoCsvFile] = useState<File | null>(null);
  const [grnCsvFile, setGrnCsvFile] = useState<File | null>(null);
  const [importingPo, setImportingPo] = useState(false);
  const [importingGrn, setImportingGrn] = useState(false);
  const [poImportResult, setPoImportResult] = useState<ImportResult | null>(null);
  const [grnImportResult, setGrnImportResult] = useState<ImportResult | null>(null);

  const poFileRef = useRef<HTMLInputElement>(null);
  const grnFileRef = useRef<HTMLInputElement>(null);
  const poCsvRef = useRef<HTMLInputElement>(null);
  const grnCsvRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!currentOrg) return;
    (async () => {
      setLoadingData(true);
      const [{ data: poData }, { data: grnData }] = await Promise.all([
        supabase.from("purchase_orders").select("*").eq("org_id", currentOrg.id).order("created_at", { ascending: false }),
        supabase.from("goods_receipt_notes").select("*").eq("org_id", currentOrg.id).order("created_at", { ascending: false }),
      ]);
      if (poData) setPos(poData as PurchaseOrder[]);
      if (grnData) setGrns(grnData as GoodsReceiptNote[]);
      setLoadingData(false);
    })();
  }, [currentOrg]);

  async function refreshPos() {
    if (!currentOrg) return;
    const { data } = await supabase.from("purchase_orders").select("*").eq("org_id", currentOrg.id).order("created_at", { ascending: false });
    if (data) setPos(data as PurchaseOrder[]);
  }

  async function refreshGrns() {
    if (!currentOrg) return;
    const { data } = await supabase.from("goods_receipt_notes").select("*").eq("org_id", currentOrg.id).order("created_at", { ascending: false });
    if (data) setGrns(data as GoodsReceiptNote[]);
  }

  async function handlePoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !user) return;
    if (!poForm.po_number.trim()) { toast({ title: "PO Number is required", variant: "destructive" }); return; }
    setSubmittingPo(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (poFile) {
        fileUrl = await uploadFileToStorage(poFile, currentOrg.id);
        fileName = poFile.name;
        if (!fileUrl) toast({ title: "File upload failed", description: "Record saved without PDF.", variant: "destructive" });
      }
      const { data, error } = await supabase.from("purchase_orders").insert({
        org_id: currentOrg.id,
        po_number: poForm.po_number.trim(),
        vendor_name: poForm.vendor_name.trim() || null,
        total_amount: poForm.total_amount ? parseFloat(poForm.total_amount) : null,
        currency: poForm.currency || "PKR",
        file_url: fileUrl,
        file_name: fileName,
        uploaded_by: user.id,
      }).select("*").single();
      if (error) throw new Error(error.message);
      setPos((prev) => [data as PurchaseOrder, ...prev]);
      setPoForm(EMPTY_PO);
      setPoFile(null);
      if (poFileRef.current) poFileRef.current.value = "";
      toast({ title: "Purchase Order saved", description: `PO ${data.po_number} added.` });
    } catch (err) {
      toast({ title: "Failed to save PO", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmittingPo(false);
    }
  }

  async function handleGrnSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !user) return;
    if (!grnForm.grn_number.trim()) { toast({ title: "GRN Number is required", variant: "destructive" }); return; }
    setSubmittingGrn(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (grnFile) {
        fileUrl = await uploadFileToStorage(grnFile, currentOrg.id);
        fileName = grnFile.name;
        if (!fileUrl) toast({ title: "File upload failed", description: "Record saved without PDF.", variant: "destructive" });
      }
      const { data, error } = await supabase.from("goods_receipt_notes").insert({
        org_id: currentOrg.id,
        grn_number: grnForm.grn_number.trim(),
        po_number: grnForm.po_number.trim() || null,
        vendor_name: grnForm.vendor_name.trim() || null,
        total_received_amount: grnForm.total_received_amount ? parseFloat(grnForm.total_received_amount) : null,
        received_at: grnForm.received_at || null,
        file_url: fileUrl,
        file_name: fileName,
        uploaded_by: user.id,
      }).select("*").single();
      if (error) throw new Error(error.message);
      setGrns((prev) => [data as GoodsReceiptNote, ...prev]);
      setGrnForm(EMPTY_GRN);
      setGrnFile(null);
      if (grnFileRef.current) grnFileRef.current.value = "";
      toast({ title: "GRN saved", description: `GRN ${data.grn_number} added.` });
    } catch (err) {
      toast({ title: "Failed to save GRN", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmittingGrn(false);
    }
  }

  async function handlePoImport() {
    if (!currentOrg || !session?.access_token || !poCsvFile) {
      toast({ title: "Select a CSV file first", variant: "destructive" });
      return;
    }
    setImportingPo(true);
    setPoImportResult(null);
    try {
      const form = new FormData();
      form.append("file", poCsvFile);
      const res = await fetch("/api/v1/import/po", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "x-org-id": currentOrg.id },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setPoImportResult(body as ImportResult);
      await refreshPos();
      toast({ title: "PO import complete", description: `${body.imported} imported, ${body.skipped} skipped` });
    } catch (err) {
      toast({ title: "PO import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setImportingPo(false);
    }
  }

  async function handleGrnImport() {
    if (!currentOrg || !session?.access_token || !grnCsvFile) {
      toast({ title: "Select a CSV file first", variant: "destructive" });
      return;
    }
    setImportingGrn(true);
    setGrnImportResult(null);
    try {
      const form = new FormData();
      form.append("file", grnCsvFile);
      const res = await fetch("/api/v1/import/grn", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "x-org-id": currentOrg.id },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setGrnImportResult(body as ImportResult);
      await refreshGrns();
      toast({ title: "GRN import complete", description: `${body.imported} imported, ${body.skipped} skipped` });
    } catch (err) {
      toast({ title: "GRN import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setImportingGrn(false);
    }
  }

  if (authLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="po">
          <TabsList className="mb-4">
            <TabsTrigger value="po">Purchase Orders (PO)</TabsTrigger>
            <TabsTrigger value="grn">Goods Receipt Notes (GRN)</TabsTrigger>
          </TabsList>

          {/* ── PO Tab ── */}
          <TabsContent value="po">
            <div className="space-y-4">

              {/* Manual entry */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4" />
                    Add Purchase Order
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePoSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="po-number">PO Number *</Label>
                      <Input id="po-number" placeholder="e.g. PO-2024-001" value={poForm.po_number}
                        onChange={(e) => setPoForm((f) => ({ ...f, po_number: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="po-vendor">Vendor Name</Label>
                      <Input id="po-vendor" placeholder="e.g. ACME Supplies" value={poForm.vendor_name}
                        onChange={(e) => setPoForm((f) => ({ ...f, vendor_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="po-amount">Total Amount</Label>
                      <Input id="po-amount" type="number" min="0" step="0.01" placeholder="0.00" value={poForm.total_amount}
                        onChange={(e) => setPoForm((f) => ({ ...f, total_amount: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="po-currency">Currency</Label>
                      <Input id="po-currency" placeholder="PKR" value={poForm.currency}
                        onChange={(e) => setPoForm((f) => ({ ...f, currency: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="po-file">PDF Attachment (optional)</Label>
                      <div className="flex items-center gap-2">
                        <Input id="po-file" type="file" accept="application/pdf" ref={poFileRef} className="cursor-pointer"
                          onChange={(e) => setPoFile(e.target.files?.[0] ?? null)} />
                        {poFile && (
                          <button type="button" onClick={() => { setPoFile(null); if (poFileRef.current) poFileRef.current.value = ""; }}
                            className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" disabled={submittingPo} className="w-full">
                        {submittingPo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Save PO
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* CSV import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="h-4 w-4" />
                    Import POs from CSV
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Required columns: <code className="bg-muted px-1 rounded">Purchase Order No</code>, <code className="bg-muted px-1 rounded">Supplier Name</code>, <code className="bg-muted px-1 rounded">Net Amount</code>.
                    Optional: <code className="bg-muted px-1 rounded">Order Date</code>, <code className="bg-muted px-1 rounded">Item Description</code>, <code className="bg-muted px-1 rounded">Quantity</code>, <code className="bg-muted px-1 rounded">Unit Price</code>.
                    Multiple rows with the same PO number are grouped into one record with line items.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      ref={poCsvRef}
                      className="cursor-pointer max-w-xs"
                      onChange={(e) => { setPoCsvFile(e.target.files?.[0] ?? null); setPoImportResult(null); }}
                    />
                    {poCsvFile && (
                      <button type="button" onClick={() => { setPoCsvFile(null); setPoImportResult(null); if (poCsvRef.current) poCsvRef.current.value = ""; }}
                        className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    )}
                    <Button onClick={handlePoImport} disabled={importingPo || !poCsvFile}>
                      {importingPo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Import
                    </Button>
                  </div>
                  {poImportResult && <ImportResultBanner result={poImportResult} />}
                </CardContent>
              </Card>

              {/* List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Uploaded Purchase Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  {!currentOrg ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No organization selected.</p>
                  ) : loadingData ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : pos.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No purchase orders yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PO Number</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead>File</TableHead>
                          <TableHead>Added</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pos.map((po) => (
                          <TableRow key={po.id}>
                            <TableCell className="font-semibold">{po.po_number}</TableCell>
                            <TableCell>{po.vendor_name ?? "—"}</TableCell>
                            <TableCell>{po.total_amount != null ? po.total_amount.toLocaleString() : "—"}</TableCell>
                            <TableCell>{po.currency ?? "—"}</TableCell>
                            <TableCell>
                              {po.file_url ? (
                                <a href={po.file_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary underline">
                                  <FileText className="h-3 w-3" />{po.file_name ?? "View"}
                                </a>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {new Date(po.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── GRN Tab ── */}
          <TabsContent value="grn">
            <div className="space-y-4">

              {/* Manual entry */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4" />
                    Add Goods Receipt Note
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleGrnSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="grn-number">GRN Number *</Label>
                      <Input id="grn-number" placeholder="e.g. GRN-2024-001" value={grnForm.grn_number}
                        onChange={(e) => setGrnForm((f) => ({ ...f, grn_number: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="grn-po">Linked PO Number</Label>
                      <Input id="grn-po" placeholder="e.g. PO-2024-001" value={grnForm.po_number}
                        onChange={(e) => setGrnForm((f) => ({ ...f, po_number: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="grn-vendor">Vendor Name</Label>
                      <Input id="grn-vendor" placeholder="e.g. ACME Supplies" value={grnForm.vendor_name}
                        onChange={(e) => setGrnForm((f) => ({ ...f, vendor_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="grn-amount">Total Received Amount</Label>
                      <Input id="grn-amount" type="number" min="0" step="0.01" placeholder="0.00" value={grnForm.total_received_amount}
                        onChange={(e) => setGrnForm((f) => ({ ...f, total_received_amount: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="grn-date">Date Received</Label>
                      <Input id="grn-date" type="date" value={grnForm.received_at}
                        onChange={(e) => setGrnForm((f) => ({ ...f, received_at: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="grn-file">PDF Attachment (optional)</Label>
                      <div className="flex items-center gap-2">
                        <Input id="grn-file" type="file" accept="application/pdf" ref={grnFileRef} className="cursor-pointer"
                          onChange={(e) => setGrnFile(e.target.files?.[0] ?? null)} />
                        {grnFile && (
                          <button type="button" onClick={() => { setGrnFile(null); if (grnFileRef.current) grnFileRef.current.value = ""; }}
                            className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end sm:col-span-2 lg:col-span-3">
                      <Button type="submit" disabled={submittingGrn}>
                        {submittingGrn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        Save GRN
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* CSV import */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="h-4 w-4" />
                    Import GRNs from CSV
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Required columns: <code className="bg-muted px-1 rounded">GRN No</code>, <code className="bg-muted px-1 rounded">Supplier Name</code>.
                    Optional: <code className="bg-muted px-1 rounded">PO Reference</code>, <code className="bg-muted px-1 rounded">Received Date</code>, <code className="bg-muted px-1 rounded">Item Description</code>, <code className="bg-muted px-1 rounded">Quantity Received</code>.
                    Multiple rows with the same GRN number are grouped into one record with line items.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      ref={grnCsvRef}
                      className="cursor-pointer max-w-xs"
                      onChange={(e) => { setGrnCsvFile(e.target.files?.[0] ?? null); setGrnImportResult(null); }}
                    />
                    {grnCsvFile && (
                      <button type="button" onClick={() => { setGrnCsvFile(null); setGrnImportResult(null); if (grnCsvRef.current) grnCsvRef.current.value = ""; }}
                        className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    )}
                    <Button onClick={handleGrnImport} disabled={importingGrn || !grnCsvFile}>
                      {importingGrn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Import
                    </Button>
                  </div>
                  {grnImportResult && <ImportResultBanner result={grnImportResult} />}
                </CardContent>
              </Card>

              {/* List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Uploaded Goods Receipt Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {!currentOrg ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No organization selected.</p>
                  ) : loadingData ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : grns.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No goods receipt notes yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>GRN Number</TableHead>
                          <TableHead>Linked PO</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Amount Received</TableHead>
                          <TableHead>Received At</TableHead>
                          <TableHead>File</TableHead>
                          <TableHead>Added</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grns.map((grn) => (
                          <TableRow key={grn.id}>
                            <TableCell className="font-semibold">{grn.grn_number}</TableCell>
                            <TableCell>{grn.po_number ?? "—"}</TableCell>
                            <TableCell>{grn.vendor_name ?? "—"}</TableCell>
                            <TableCell>{grn.total_received_amount != null ? grn.total_received_amount.toLocaleString() : "—"}</TableCell>
                            <TableCell>{grn.received_at ? new Date(grn.received_at).toLocaleDateString() : "—"}</TableCell>
                            <TableCell>
                              {grn.file_url ? (
                                <a href={grn.file_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary underline">
                                  <FileText className="h-3 w-3" />{grn.file_name ?? "View"}
                                </a>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {new Date(grn.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
