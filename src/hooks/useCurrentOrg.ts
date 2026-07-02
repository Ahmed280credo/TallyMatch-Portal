import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

const STORAGE_KEY = "current_org_id";

export function useCurrentOrg() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setCurrentOrg(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("organization_members")
        .select("role, organizations:org_id(id, name, slug)")
        .eq("user_id", user.id);

      if (error || !data) {
        setOrgs([]);
        setCurrentOrg(null);
        setLoading(false);
        return;
      }

      const list: Org[] = data
        .map((row: any) => row.organizations ? {
          id: row.organizations.id,
          name: row.organizations.name,
          slug: row.organizations.slug,
          role: row.role,
        } : null)
        .filter(Boolean) as Org[];

      setOrgs(list);

      const stored = localStorage.getItem(STORAGE_KEY);
      const found = list.find((o) => o.id === stored);
      setCurrentOrg(found ?? list[0] ?? null);
      setLoading(false);
    })();
  }, [user]);

  const switchOrg = useCallback((orgId: string) => {
    const next = orgs.find((o: { id: string; }) => o.id === orgId);
    if (next) {
      setCurrentOrg(next);
      localStorage.setItem(STORAGE_KEY, next.id);
    }
  }, [orgs]);

  return { currentOrg, orgs, loading, switchOrg };
}