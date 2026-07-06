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
      accounts: {
        Row: {
          account_number: string
          account_type: string
          balance: number
          created_at: string
          customer_id: string | null
          failed_pin_attempts: number
          full_name: string
          id: string
          is_system: boolean
          pin_locked_until: string | null
          send_locked_until: string | null
          transfer_pin_hash: string | null
        }
        Insert: {
          account_number: string
          account_type?: string
          balance?: number
          created_at?: string
          customer_id?: string | null
          failed_pin_attempts?: number
          full_name: string
          id?: string
          is_system?: boolean
          pin_locked_until?: string | null
          send_locked_until?: string | null
          transfer_pin_hash?: string | null
        }
        Update: {
          account_number?: string
          account_type?: string
          balance?: number
          created_at?: string
          customer_id?: string | null
          failed_pin_attempts?: number
          full_name?: string
          id?: string
          is_system?: boolean
          pin_locked_until?: string | null
          send_locked_until?: string | null
          transfer_pin_hash?: string | null
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          attack_count: number
          blocked_by: string
          first_seen: string
          ip_address: string
          last_seen: string
          permanent: boolean
          reason: string
        }
        Insert: {
          attack_count?: number
          blocked_by?: string
          first_seen?: string
          ip_address: string
          last_seen?: string
          permanent?: boolean
          reason: string
        }
        Update: {
          attack_count?: number
          blocked_by?: string
          first_seen?: string
          ip_address?: string
          last_seen?: string
          permanent?: boolean
          reason?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          failed_login_attempts: number
          failed_security_attempts: number
          full_name: string
          id: string
          login_locked_until: string | null
          security_answer_hash: string | null
          security_question: string | null
        }
        Insert: {
          created_at?: string
          failed_login_attempts?: number
          failed_security_attempts?: number
          full_name?: string
          id: string
          login_locked_until?: string | null
          security_answer_hash?: string | null
          security_question?: string | null
        }
        Update: {
          created_at?: string
          failed_login_attempts?: number
          failed_security_attempts?: number
          full_name?: string
          id?: string
          login_locked_until?: string | null
          security_answer_hash?: string | null
          security_question?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          account_id: string | null
          created_at: string
          details: Json
          email: string | null
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          details?: Json
          email?: string | null
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          details?: Json
          email?: string | null
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      soc_events: {
        Row: {
          created_at: string
          details: Json
          field: string | null
          fingerprint: string | null
          id: string
          ip_address: string | null
          payload: string | null
          priority: number
          reviewed: boolean
          severity: string
          simulated: boolean
          status: string
          target_account_id: string | null
          target_email: string | null
          threat_type: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          field?: string | null
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          payload?: string | null
          priority?: number
          reviewed?: boolean
          severity: string
          simulated?: boolean
          status?: string
          target_account_id?: string | null
          target_email?: string | null
          threat_type: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          field?: string | null
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          payload?: string | null
          priority?: number
          reviewed?: boolean
          severity?: string
          simulated?: boolean
          status?: string
          target_account_id?: string | null
          target_email?: string | null
          threat_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          duplicate_confirmed: boolean
          id: string
          initiated_by: Database["public"]["Enums"]["tx_initiator"]
          location: string | null
          note: string | null
          reason_flagged: string | null
          related_account_id: string | null
          status: Database["public"]["Enums"]["tx_status"]
          timestamp: string
          type: Database["public"]["Enums"]["tx_type"]
        }
        Insert: {
          account_id: string
          amount: number
          duplicate_confirmed?: boolean
          id?: string
          initiated_by?: Database["public"]["Enums"]["tx_initiator"]
          location?: string | null
          note?: string | null
          reason_flagged?: string | null
          related_account_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          timestamp?: string
          type: Database["public"]["Enums"]["tx_type"]
        }
        Update: {
          account_id?: string
          amount?: number
          duplicate_confirmed?: boolean
          id?: string
          initiated_by?: Database["public"]["Enums"]["tx_initiator"]
          location?: string | null
          note?: string | null
          reason_flagged?: string | null
          related_account_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          timestamp?: string
          type?: Database["public"]["Enums"]["tx_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_related_account_id_fkey"
            columns: ["related_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_clear_simulated_soc: { Args: never; Returns: number }
      admin_flag_ip: {
        Args: { _ip: string; _permanent: boolean; _reason: string }
        Returns: undefined
      }
      admin_reset_demo: { Args: never; Returns: Json }
      admin_set_setting: {
        Args: { _key: string; _value: Json }
        Returns: undefined
      }
      admin_soc_action: {
        Args: { _action: string; _event_id: string }
        Returns: undefined
      }
      admin_unblock_ip: { Args: { _ip: string }; Returns: undefined }
      check_duplicate_transfer: {
        Args: { _amount: number; _recipient_account_number: string }
        Returns: Json
      }
      check_login_lock: { Args: { _email: string }; Returns: Json }
      evaluate_fraud: {
        Args: { _account_id: string; _amount: number; _location: string }
        Returns: {
          reason: string
          status: Database["public"]["Enums"]["tx_status"]
        }[]
      }
      execute_transfer: {
        Args: {
          _amount: number
          _confirm_duplicate?: boolean
          _location: string
          _note: string
          _recipient_account_number: string
        }
        Returns: Json
      }
      flag_admin_login_attack: {
        Args: { _attempts: number; _email: string; _ip: string }
        Returns: undefined
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_my_security_question: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_email: { Args: { _email: string }; Returns: boolean }
      is_rule_on: {
        Args: { _default?: boolean; _key: string }
        Returns: boolean
      }
      log_cap_rejection: {
        Args: {
          _attempted_amount: number
          _balance: number
          _cap: number
          _recipient: string
        }
        Returns: undefined
      }
      log_duplicate_attempt: {
        Args: {
          _amount: number
          _recipient_account_number: string
          _resolution: string
          _seconds_ago: number
        }
        Returns: undefined
      }
      log_password_reset: { Args: { _email: string }; Returns: undefined }
      log_security_challenge_triggered: {
        Args: { _amount: number; _balance: number }
        Returns: undefined
      }
      log_soc_event: {
        Args: {
          _details: Json
          _field: string
          _fingerprint: string
          _ip_address: string
          _payload: string
          _severity: string
          _simulated: boolean
          _target_email: string
          _threat_type: string
          _user_agent: string
        }
        Returns: string
      }
      lookup_recipient: {
        Args: { _account_number: string }
        Returns: {
          account_number: string
          account_type: string
          full_name: string
        }[]
      }
      register_failed_login: { Args: { _email: string }; Returns: Json }
      register_successful_login: { Args: never; Returns: undefined }
      set_security_question: {
        Args: { _answer: string; _question: string }
        Returns: undefined
      }
      simulate_tick: { Args: never; Returns: Json }
      verify_security_answer: {
        Args: { _amount: number; _answer: string; _balance: number }
        Returns: Json
      }
      verify_transfer_pin: { Args: { _pin: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "customer"
      tx_initiator: "system" | "customer"
      tx_status: "normal" | "flagged"
      tx_type: "deposit" | "withdrawal" | "transfer_out" | "transfer_in"
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
      app_role: ["admin", "customer"],
      tx_initiator: ["system", "customer"],
      tx_status: ["normal", "flagged"],
      tx_type: ["deposit", "withdrawal", "transfer_out", "transfer_in"],
    },
  },
} as const
