import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Save,
  ArrowRight,
  HelpCircle
} from "lucide-react";

export interface FieldDefinitionUI {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const TARGET_FIELDS_UI: FieldDefinitionUI[] = [
  { key: "invoice_number", label: "Invoice Number", required: true, description: "Unique invoice ID" },
  { key: "vendor_name", label: "Vendor Name", required: true, description: "Supplier or seller business name" },
  { key: "amount", label: "Total Amount", required: true, description: "Total payable invoice amount" },
  { key: "due_date", label: "Due Date", required: true, description: "Payment maturity or due date" },
  { key: "vendor_tax_id", label: "Vendor Tax ID / NTN", required: false, description: "Vendor NTN or STRN tax ID" },
  { key: "invoice_date", label: "Invoice Date", required: false, description: "Billing or document date" },
  { key: "currency", label: "Currency", required: false, description: "ISO 3-letter code (defaults to PKR)" },
  { key: "po_number", label: "Purchase Order #", required: false, description: "Linked PO for 3-way matching" },
  { key: "grn_number", label: "Goods Receipt #", required: false, description: "Linked GRN for 3-way matching" },
  { key: "line_items_description", label: "Line Items / Description", required: false, description: "Items summary for matching" },
  { key: "payment_terms", label: "Payment Terms", required: false, description: "Terms of payment (e.g. Net 30)" }
];

export interface PreviewData {
  upload_id: string;
  fileName: string;
  detected_columns: string[];
  sample_rows: Record<string, string>[];
  suggested_mapping: Record<string, string | null>;
}

export interface SavedMappingPreset {
  id: string;
  name: string;
  column_mapping: Record<string, string | null>;
}

interface ColumnMappingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewData: PreviewData | null;
  savedPresets?: SavedMappingPreset[];
  onConfirm: (mapping: Record<string, string | null>, savePresetName?: string) => Promise<void>;
  confirming: boolean;
}

const NONE_VALUE = "__NONE__";

export default function ColumnMappingModal({
  open,
  onOpenChange,
  previewData,
  savedPresets = [],
  onConfirm,
  confirming
}: ColumnMappingModalProps) {
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("mapping");

  useEffect(() => {
    if (previewData) {
      setMapping({ ...previewData.suggested_mapping });
      setSaveAsPreset(false);
      setPresetName("");
      setSelectedPresetId("");
      setActiveTab("mapping");
    }
  }, [previewData]);

  if (!previewData) return null;

  const detectedColumns = previewData.detected_columns;

  const handleFieldChange = (fieldKey: string, selectedValue: string) => {
    setMapping((prev) => ({
      ...prev,
      [fieldKey]: selectedValue === NONE_VALUE ? null : selectedValue
    }));
  };

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = savedPresets.find((p) => p.id === presetId);
    if (preset) {
      setMapping({ ...preset.column_mapping });
    }
  };

  // Check required field mappings
  const missingRequired = TARGET_FIELDS_UI.filter(
    (f) => f.required && (!mapping[f.key] || mapping[f.key] === NONE_VALUE)
  );

  const isValid = missingRequired.length === 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    await onConfirm(mapping, saveAsPreset && presetName.trim() ? presetName.trim() : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg">Map CSV Columns: {previewData.fileName}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Match the columns in your uploaded CSV with TallyMatch fields. Required fields must be mapped before importing.
          </DialogDescription>
        </DialogHeader>

        {/* ── Saved Presets Selector ── */}
        {savedPresets.length > 0 && (
          <div className="flex items-center gap-3 py-2 px-3 bg-muted/40 rounded-lg text-xs">
            <span className="font-medium text-muted-foreground">Load Saved Preset:</span>
            <Select value={selectedPresetId} onValueChange={handlePresetSelect}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="Choose a preset..." />
              </SelectTrigger>
              <SelectContent>
                {savedPresets.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="mapping" className="text-xs">
              Field Mapping ({11 - missingRequired.length}/11 mapped)
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              Sample Data Preview ({previewData.sample_rows.length} rows)
            </TabsTrigger>
          </TabsList>

          {/* ──────────────────────── MAPPING TAB ──────────────────────── */}
          <TabsContent value="mapping" className="flex-1 overflow-y-auto pr-1 space-y-3 py-2">
            {missingRequired.length > 0 && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  Please map required fields:{" "}
                  <strong>{missingRequired.map((f) => f.label).join(", ")}</strong>
                </span>
              </div>
            )}

            <div className="space-y-2">
              {TARGET_FIELDS_UI.map((field) => {
                const currentVal = mapping[field.key] || NONE_VALUE;
                const isMapped = currentVal !== NONE_VALUE;
                const isMissing = field.required && !isMapped;

                return (
                  <div
                    key={field.key}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg border text-xs gap-2 transition-colors ${
                      isMissing
                        ? "border-destructive/40 bg-destructive/5"
                        : isMapped
                        ? "border-primary/20 bg-primary/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{field.label}</span>
                        {field.required ? (
                          <Badge variant="destructive" className="h-4 px-1 text-[10px] uppercase font-bold">
                            Required
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Optional</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{field.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
                      <Select
                        value={currentVal}
                        onValueChange={(val) => handleFieldChange(field.key, val)}
                      >
                        <SelectTrigger
                          className={`h-8 w-56 text-xs ${
                            isMissing
                              ? "border-destructive text-destructive font-medium"
                              : isMapped
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          <SelectValue placeholder="Select CSV Column..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          <SelectItem value={NONE_VALUE} className="text-xs text-muted-foreground italic">
                            -- Do Not Map --
                          </SelectItem>
                          {detectedColumns.map((col) => (
                            <SelectItem key={col} value={col} className="text-xs">
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Save Preset Option ── */}
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="save-preset-chk"
                  checked={saveAsPreset}
                  onChange={(e) => setSaveAsPreset(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <Label htmlFor="save-preset-chk" className="text-xs cursor-pointer">
                  Save this mapping configuration for future uploads
                </Label>
              </div>

              {saveAsPreset && (
                <div className="flex items-center gap-2 pl-5">
                  <Input
                    placeholder="Preset name (e.g., SAP Export, QuickBooks CSV)"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    className="h-8 text-xs max-w-sm"
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* ──────────────────────── PREVIEW TAB ──────────────────────── */}
          <TabsContent value="preview" className="flex-1 overflow-auto py-2">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {detectedColumns.map((col) => {
                      // Find which target field maps to this column
                      const mappedField = Object.entries(mapping).find(([_, c]) => c === col)?.[0];
                      const fieldDef = TARGET_FIELDS_UI.find((f) => f.key === mappedField);

                      return (
                        <TableHead key={col} className="text-xs whitespace-nowrap py-2">
                          <div className="font-semibold text-foreground">{col}</div>
                          {fieldDef ? (
                            <Badge className="mt-0.5 text-[9px] px-1 py-0 h-4 bg-primary/20 text-primary border-primary/30">
                              → {fieldDef.label}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Unmapped</span>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.sample_rows.map((row, idx) => (
                    <TableRow key={idx}>
                      {detectedColumns.map((col) => (
                        <TableCell key={col} className="text-xs py-2 whitespace-nowrap max-w-[200px] truncate">
                          {row[col] || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-3 border-t flex items-center justify-between sm:justify-between w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!isValid || confirming}
            className="text-xs gap-1.5"
          >
            {confirming ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importing & Matching...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirm & Import Invoices
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
