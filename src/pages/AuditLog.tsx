import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type AuditRow = Tables<"invoice_audit_log">;

interface GroupedInvoice {
  invoice_number: string;
  vendor_name: string | null;
  latestStatus: string | null;
  latestEvent: string;
  latestDate: string;
  rows: AuditRow[];
}

const eventStyles: Record<string, string> = {
  MATCH_FAILED: "bg-red-200",
  APPROVED: "bg-blue-200",
  PROCESSED: "bg-green-100 text-green-800 border-green-200",
  DUPLICATE_DETECTED: "bg-yellow-100 text-yellow-800 border-yellow-200",
  EXTRACTION_FAILED: "bg-red-100 text-red-800 border-red-200",
  status_change: "bg-blue-50 text-blue-700 border-blue-200",
};

const statusStyles: Record<string, string> = {
  processed: "bg-green-100 text-green-800 border-green-200",
  success: "bg-green-100 text-green-800 border-green-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  paid: "bg-purple-100 text-purple-800 border-purple-200",
  mismatch: "bg-red-100 text-red-800 border-red-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  flagged: "bg-yellow-100 text-yellow-800 border-yellow-200",
  duplicate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  pending_match: "bg-orange-100 text-orange-800 border-orange-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-200",
  extracted: "bg-sky-100 text-sky-800 border-sky-200",
};

const timelineDotMap: Record<string, string> = {
  MATCH_FAILED: "bg-red-500",
  APPROVED: "bg-blue-500",
  PROCESSED: "bg-green-500",
  DUPLICATE_DETECTED: "bg-yellow-500",
  EXTRACTION_FAILED: "bg-red-500",
  status_change_paid: "bg-purple-500",
  status_change_approved: "bg-blue-500",
  status_change_mismatch: "bg-red-400",
  status_change_pending: "bg-amber-400",
  status_change_pending_match: "bg-orange-400",
  status_change_pending_review: "bg-amber-400",
};

function getDotColor(row: AuditRow) {
  if (row.event === "status_change" && row.status) {
    return timelineDotMap[`status_change_${row.status}`] ?? "bg-gray-400";
  }
  return timelineDotMap[row.event] ?? "bg-gray-400";
}

function groupRows(rows: AuditRow[]): GroupedInvoice[] {
  const map = new Map<string, AuditRow[]>();

  for (const row of rows) {
    const key = row.invoice_number ?? `__no_inv_${row.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const groups: GroupedInvoice[] = [];
  map.forEach((invoiceRows) => {
    const sorted = [...invoiceRows].sort((a, b) => {
      const da = new Date(a.processed_at ?? a.created_at).getTime();
      const db = new Date(b.processed_at ?? b.created_at).getTime();
      return db - da;
    });

    const latest = sorted[0];
    groups.push({
      invoice_number: latest.invoice_number ?? "—",
      vendor_name: latest.vendor_name,
      latestStatus: latest.status,
      latestEvent: latest.event,
      latestDate: latest.processed_at ?? latest.created_at,
      rows: sorted,
    });
  });

  return groups.sort(
    (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
  );
}

export default function AuditLog() {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useCurrentOrg();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!currentOrg) return;
    const fetchLogs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("invoice_audit_log")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("processed_at", { ascending: false, nullsFirst: false })
        .limit(200);

      if (!error && data) setRows(data as AuditRow[]);
      setLoading(false);
    };

    fetchLogs();

    const channel = supabase
      .channel("audit-log-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "invoice_audit_log",
        filter: `org_id=eq.${currentOrg.id}`,
      }, () => fetchLogs())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const toggleExpand = (invoiceNumber: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceNumber)) next.delete(invoiceNumber);
      else next.add(invoiceNumber);
      return next;
    });
  };

  if (authLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const groups = groupRows(rows);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {!currentOrg ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No organization selected.
              </p>
            ) : loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : groups.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No audit log entries yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Processed At</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Latest Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">History</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => {
                    const isOpen = expanded.has(group.invoice_number);
                    return (
                      <>
                        {/* ── Main grouped row ── */}
                        <TableRow
                          key={group.invoice_number}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => toggleExpand(group.invoice_number)}
                        >
                          <TableCell className="pr-0">
                            {group.rows.length > 1 ? (
                              isOpen ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )
                            ) : null}
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(group.latestDate).toLocaleString()}
                          </TableCell>

                          <TableCell className="font-semibold">
                            {group.invoice_number}
                          </TableCell>

                          <TableCell>{group.vendor_name ?? "—"}</TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                eventStyles[group.latestEvent] ??
                                "bg-muted text-muted-foreground"
                              }
                            >
                              {group.latestEvent}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {group.latestStatus ? (
                              <Badge
                                variant="outline"
                                className={statusStyles[group.latestStatus] ?? ""}
                              >
                                {group.latestStatus}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            {group.rows.length > 1 && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {group.rows.length} events
                              </span>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* ── Expandable timeline ── */}
                        {isOpen && group.rows.length > 1 && (
                          <TableRow key={`${group.invoice_number}-detail`}>
                            <TableCell
                              colSpan={7}
                              className="bg-muted/30 py-0 border-b"
                            >
                              <div className="px-8 py-4">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  Event History
                                </p>
                                <ol className="relative border-l border-border ml-2 space-y-0">
                                  {group.rows.map((r, idx) => (
                                    <li key={r.id} className="ml-5 pb-4 last:pb-1">
                                      {/* Timeline dot */}
                                      <span
                                        className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${getDotColor(r)}`}
                                      />

                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                          {new Date(
                                            r.processed_at ?? r.created_at
                                          ).toLocaleString()}
                                        </span>

                                        <Badge
                                          variant="outline"
                                          className={`text-xs ${eventStyles[r.event] ??
                                            "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                          {r.event}
                                        </Badge>

                                        {r.status && (
                                          <Badge
                                            variant="outline"
                                            className={`text-xs ${statusStyles[r.status] ?? ""
                                              }`}
                                          >
                                            {r.status}
                                          </Badge>
                                        )}

                                        {idx === 0 && (
                                          <span className="text-xs text-muted-foreground italic">
                                            latest
                                          </span>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}