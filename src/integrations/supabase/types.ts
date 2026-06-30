export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      commitments: {
        Row: {
          assigned_to: string | null
          ai_note: string | null
          created_at: string
          customer: string | null
          expected_revenue: number | null
          id: string
          intake_id: string | null
          missed_reason: string | null
          next_action: string | null
          product: string | null
          promise_date: string | null
          remarks: string | null
          reminder_date: string | null
          risk_level: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          ai_note?: string | null
          created_at?: string
          customer?: string | null
          expected_revenue?: number | null
          id?: string
          intake_id?: string | null
          missed_reason?: string | null
          next_action?: string | null
          product?: string | null
          promise_date?: string | null
          remarks?: string | null
          reminder_date?: string | null
          risk_level?: string | null
          salesperson?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          ai_note?: string | null
          created_at?: string
          customer?: string | null
          expected_revenue?: number | null
          id?: string
          intake_id?: string | null
          missed_reason?: string | null
          next_action?: string | null
          product?: string | null
          promise_date?: string | null
          remarks?: string | null
          reminder_date?: string | null
          risk_level?: string | null
          salesperson?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "intakes"
            referencedColumns: ["id"]
          },
        ]
      }
      intakes: {
        Row: {
          created_at: string
          extracted: Json | null
          file_name: string | null
          id: string
          raw_text: string | null
          source: Database["public"]["Enums"]["intake_source"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted?: Json | null
          file_name?: string | null
          id?: string
          raw_text?: string | null
          source?: Database["public"]["Enums"]["intake_source"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted?: Json | null
          file_name?: string | null
          id?: string
          raw_text?: string | null
          source?: Database["public"]["Enums"]["intake_source"]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          commitment_id: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          commitment_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          commitment_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
        }
        Relationships: []
      }
      sales_team_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          member_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          member_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          member_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_team_messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_team_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      commitments_with_status: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          customer: string | null
          effective_status:
            | Database["public"]["Enums"]["commitment_status"]
            | null
          expected_revenue: number | null
          id: string | null
          intake_id: string | null
          next_action: string | null
          product: string | null
          promise_date: string | null
          remarks: string | null
          reminder_date: string | null
          risk_level: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["commitment_status"] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          customer?: string | null
          effective_status?: never
          expected_revenue?: number | null
          id?: string | null
          intake_id?: string | null
          next_action?: string | null
          product?: string | null
          promise_date?: string | null
          remarks?: string | null
          reminder_date?: string | null
          risk_level?: string | null
          salesperson?: string | null
          status?: Database["public"]["Enums"]["commitment_status"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          customer?: string | null
          effective_status?: never
          expected_revenue?: number | null
          id?: string | null
          intake_id?: string | null
          next_action?: string | null
          product?: string | null
          promise_date?: string | null
          remarks?: string | null
          reminder_date?: string | null
          risk_level?: string | null
          salesperson?: string | null
          status?: Database["public"]["Enums"]["commitment_status"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commitments_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "intakes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_head: { Args: { _user_id: string }; Returns: boolean }
      is_business_head: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "business_head" | "sales_head" | "sales_member"
      commitment_status: "open" | "completed" | "missed" | "delayed"
      intake_source: "text" | "voice" | "file" | "excel" | "whatsapp"
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["business_head", "sales_head", "sales_member"],
      commitment_status: ["open", "completed", "missed", "delayed"],
      intake_source: ["text", "voice", "file", "excel", "whatsapp"],
    },
  },
} as const
