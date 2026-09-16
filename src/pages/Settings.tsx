import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { apiUrl } from "@/lib/api";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Plug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// "ERP connection" is a generic concept — sap_b1 is the only provider wired
// up today, but the type/status model doesn't hardcode SAP B1 anywhere a
// second ERP would need to plug into later.
const ERP_PROVIDERS = [{ value: "sap_b1", label: "SAP Business One" }];

type ConnectionStatus = "connected" | "disconnected" | "error" | null;

interface ErpConnectionStatusResponse {
  configured: boolean;
  erp_type: string | null;
  base_url: string | null;
  company_db: string | null;
  username: string | null;
  status: ConnectionStatus;
  status_message: string | null;
  last_tested_at: string | null;
  last_sync_at: string | null;
}

function displayDateTime(s: string | null): string {
  if (!s) return "Never";
  return new Date(s).toLocaleString();
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return (
      <Badge variant="outline" className="gap-1.5 border-green-200 bg-green-100 text-green-800">
        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="gap-1.5 border-red-200 bg-red-100 text-red-800">
        <XCircle className="h-3.5 w-3.5" /> Error
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 border-slate-200 bg-slate-100 text-slate-700">
      <AlertTriangle className="h-3.5 w-3.5" /> Disconnected
    </Badge>
  );
}

export default function Settings() {
  const { user, session, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useCurrentOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const [connection, setConnection] = useState<ErpConnectionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [erpType, setErpType] = useState("sap_b1");
  const [baseUrl, setBaseUrl] = useState("");
  const [companyDb, setCompanyDb] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const fetchConnection = useCallback(async () => {
    if (!currentOrg || !session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/v1/integrations/erp/connection"), { headers: authHeaders() });
      const body = (await res.json().catch(() => ({}))) as Partial<ErpConnectionStatusResponse>;
      if (!res.ok) {
        toast({ title: "Failed to load ERP connection", variant: "destructive" });
        return;
      }
      const data = body as ErpConnectionStatusResponse;
      setConnection(data);
      if (data.configured) {
        setErpType(data.erp_type ?? "sap_b1");
        setBaseUrl(data.base_url ?? "");
        setCompanyDb(data.company_db ?? "");
        setUsername(data.username ?? "");
      }
    } catch {
      toast({ title: "Cannot reach backend server", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentOrg, session?.access_token, authHeaders, toast]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!baseUrl.trim() || !username.trim() || !password.trim()) {
      toast({ title: "Base URL, username, and password are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/v1/integrations/erp/connection"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          erp_type: erpType,
          base_url: baseUrl.trim(),
          company_db: companyDb.trim() || undefined,
          username: username.trim(),
          password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Failed to save connection", description: body?.message, variant: "destructive" });
        return;
      }
      setConnection(body as ErpConnectionStatusResponse);
      setPassword("");
      toast({ title: "ERP connection saved", description: "Run Test Connection to verify it." });
    } catch {
      toast({ title: "Network error while saving connection", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!currentOrg) return;
    setTesting(true);
    try {
      const res = await fetch(apiUrl("/api/v1/integrations/erp/connection/test"), {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Test failed", description: body?.message, variant: "destructive" });
        return;
      }
      if (body.success) {
        toast({ title: "Connection successful" });
      } else {
        toast({ title: "Connection failed", description: body.message ?? "Unknown error", variant: "destructive" });
      }
      fetchConnection();
    } catch {
      toast({ title: "Network error while testing connection", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

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
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">ERP Integration</h1>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Connection</CardTitle>
                <CardDescription>
                  Connect TallyMatch to your ERP to push matched invoices and pull Purchase Orders / Goods Receipts for 3-way matching.
                </CardDescription>
              </div>
              {!loading && <StatusBadge status={connection?.status ?? null} />}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {connection?.status_message && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {connection.status_message}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last tested</p>
                    <p className="text-foreground">{displayDateTime(connection?.last_tested_at ?? null)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last successful sync</p>
                    <p className="text-foreground">{displayDateTime(connection?.last_sync_at ?? null)}</p>
                  </div>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="erp-provider">ERP Provider</Label>
                      <Select value={erpType} onValueChange={setErpType}>
                        <SelectTrigger id="erp-provider"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ERP_PROVIDERS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="erp-company-db">Company DB</Label>
                      <Input id="erp-company-db" placeholder="e.g. SPAR_FMCG_PROD" value={companyDb}
                        onChange={(e) => setCompanyDb(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="erp-base-url">Service Layer Base URL *</Label>
                    <Input id="erp-base-url" placeholder="https://your-sap-host:50000/b1s/v1" value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)} required />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="erp-username">Username *</Label>
                      <Input id="erp-username" placeholder="manager" value={username}
                        onChange={(e) => setUsername(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="erp-password">Password *</Label>
                      <Input id="erp-password" type="password"
                        placeholder={connection?.configured ? "Re-enter to update" : "Password"}
                        value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button type="submit" disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Connection
                    </Button>
                    <Button type="button" variant="outline" disabled={testing || !connection?.configured} onClick={handleTest}>
                      {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Test Connection
                    </Button>
                  </div>
                  {!connection?.configured && (
                    <p className="text-xs text-muted-foreground">Save a connection before you can test it.</p>
                  )}
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
