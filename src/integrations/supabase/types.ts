export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      invoice_audit_log: {
        Row: {
          created_at: string
          currency: string | null
          event: string
          id: string
          invoice_id: string | null
          invoice_number: string | null
          metadata: Json | null
          notes: string | null
          org_id: string
          processed_at: string | null
          source: string | null
          status: string | null
          total_amount: number | null
          vendor_name: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          event: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          metadata?: Json | null
          notes?: string | null
          org_id: string
          processed_at?: string | null
          source?: string | null
          status?: string | null
          total_amount?: number | null
          vendor_name?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          event?: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          metadata?: Json | null
          notes?: string | null
          org_id?: string
          processed_at?: string | null
          source?: string | null
          status?: string | null
          total_amount?: number | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          uploaded_at: string | null
          status: string
          created_at: string
          updated_at: string | null
          vendor_name: string | null
          vendor_ntn: string | null
          invoice_number: string | null
          po_number: string | null
          grn_number: string | null
          invoice_date: string | null
          due_date: string | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          currency: string | null
          payment_terms: string | null
          line_items: Json | null
          fbr_status: string | null
          match_status: string | null
          match_result: Json | null
          source_file_name: string | null
          erp_type: string | null
          erp_push_status: string
          erp_doc_entry: number | null
          erp_doc_num: number | null
          erp_push_error: string | null
          erp_pushed_at: string | null
          payment_source: string | null
          erp_last_synced_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          user_id?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          status?: string
          uploaded_at?: string | null
          vendor_name?: string | null
          vendor_ntn?: string | null
          invoice_number?: string | null
          po_number?: string | null
          grn_number?: string | null
          invoice_date?: string | null
          due_date?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          currency?: string | null
          payment_terms?: string | null
          line_items?: Json | null
          fbr_status?: string | null
          match_status?: string | null
          match_result?: Json | null
          source_file_name?: string | null
          erp_type?: string | null
          erp_push_status?: string
          erp_doc_entry?: number | null
          erp_doc_num?: number | null
          erp_push_error?: string | null
          erp_pushed_at?: string | null
          payment_source?: string | null
          erp_last_synced_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          status?: string
          updated_at?: string | null
          vendor_name?: string | null
          vendor_ntn?: string | null
          invoice_number?: string | null
          po_number?: string | null
          grn_number?: string | null
          invoice_date?: string | null
          due_date?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          currency?: string | null
          payment_terms?: string | null
          line_items?: Json | null
          fbr_status?: string | null
          match_status?: string | null
          match_result?: Json | null
          source_file_name?: string | null
          erp_type?: string | null
          erp_push_status?: string
          erp_doc_entry?: number | null
          erp_doc_num?: number | null
          erp_push_error?: string | null
          erp_pushed_at?: string | null
          payment_source?: string | null
          erp_last_synced_at?: string | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          id: string
          org_id: string
          po_number: string
          vendor_name: string | null
          total_amount: number | null
          currency: string | null
          line_items: Json | null
          file_url: string | null
          file_name: string | null
          uploaded_by: string | null
          source: string
          erp_type: string | null
          erp_doc_entry: number | null
          erp_doc_num: number | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          po_number: string
          vendor_name?: string | null
          total_amount?: number | null
          currency?: string | null
          line_items?: Json | null
          file_url?: string | null
          file_name?: string | null
          uploaded_by?: string | null
          source?: string
          erp_type?: string | null
          erp_doc_entry?: number | null
          erp_doc_num?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          po_number?: string
          vendor_name?: string | null
          total_amount?: number | null
          currency?: string | null
          line_items?: Json | null
          file_url?: string | null
          file_name?: string | null
          uploaded_by?: string | null
          source?: string
          erp_type?: string | null
          erp_doc_entry?: number | null
          erp_doc_num?: number | null
          created_at?: string
        }
        Relationships: []
      }
      goods_receipt_notes: {
        Row: {
          id: string
          org_id: string
          grn_number: string
          po_number: string | null
          vendor_name: string | null
          total_received_amount: number | null
          line_items: Json | null
          received_at: string | null
          file_url: string | null
          file_name: string | null
          uploaded_by: string | null
          source: string
          erp_type: string | null
          erp_doc_entry: number | null
          erp_doc_num: number | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          grn_number: string
          po_number?: string | null
          vendor_name?: string | null
          total_received_amount?: number | null
          line_items?: Json | null
          received_at?: string | null
          file_url?: string | null
          file_name?: string | null
          uploaded_by?: string | null
          source?: string
          erp_type?: string | null
          erp_doc_entry?: number | null
          erp_doc_num?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          grn_number?: string
          po_number?: string | null
          vendor_name?: string | null
          total_received_amount?: number | null
          line_items?: Json | null
          received_at?: string | null
          file_url?: string | null
          file_name?: string | null
          uploaded_by?: string | null
          source?: string
          erp_type?: string | null
          erp_doc_entry?: number | null
          erp_doc_num?: number | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      has_org_role: {
        Args: { _org_id: string; _role: Database["public"]["Enums"]["app_role"]; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: { app_role: ["owner", "admin", "member"] },
  },
} as const