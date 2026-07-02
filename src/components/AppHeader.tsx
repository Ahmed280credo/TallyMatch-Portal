import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { Button } from "@/components/ui/button";
import { FileText, LogOut, ScrollText, LayoutDashboard, FolderOpen } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const { currentOrg, orgs, switchOrg } = useCurrentOrg();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Finflow</h1>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </NavLink>
            <NavLink to="/audit-log" className={navLinkClass}>
              <ScrollText className="h-4 w-4" />
              Activity Logs
            </NavLink>
            <NavLink to="/documents" className={navLinkClass}>
              <FolderOpen className="h-4 w-4" />
              Documents
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {orgs.length > 1 ? (
            <Select value={currentOrg?.id ?? ""} onValueChange={switchOrg}>
              <SelectTrigger className="h-8 w-[180px] text-sm">
                <SelectValue placeholder="Select org" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : currentOrg ? (
            <span className="hidden rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground sm:inline">
              {currentOrg.name}
            </span>
          ) : null}
          <span className="hidden text-sm text-muted-foreground md:inline">
            {user?.email}
          </span>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-1 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
