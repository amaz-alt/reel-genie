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
      autopilot_runs: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          message: string | null
          owner_id: string
          reel_id: string | null
          stage: string
          status: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          owner_id: string
          reel_id?: string | null
          stage: string
          status: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          owner_id?: string
          reel_id?: string | null
          stage?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_settings: {
        Row: {
          created_at: string
          drive_enabled: boolean
          drive_parent_folder_id: string | null
          drive_parent_url: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          drive_enabled?: boolean
          drive_parent_folder_id?: string | null
          drive_parent_url?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          drive_enabled?: boolean
          drive_parent_folder_id?: string | null
          drive_parent_url?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_references: {
        Row: {
          analysis: Json | null
          brand_id: string
          created_at: string
          id: string
          label: string | null
          notes: string | null
          owner_id: string
          storage_path: string
        }
        Insert: {
          analysis?: Json | null
          brand_id: string
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          owner_id: string
          storage_path: string
        }
        Update: {
          analysis?: Json | null
          brand_id?: string
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          owner_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_references_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_schedules: {
        Row: {
          active: boolean
          auto_publish: boolean
          autopilot_enabled: boolean
          brand_id: string
          created_at: string
          days_of_week: number[]
          id: string
          last_run_at: string | null
          posts_per_day: number
          time_of_day: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_publish?: boolean
          autopilot_enabled?: boolean
          brand_id: string
          created_at?: string
          days_of_week?: number[]
          id?: string
          last_run_at?: string | null
          posts_per_day?: number
          time_of_day?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_publish?: boolean
          autopilot_enabled?: boolean
          brand_id?: string
          created_at?: string
          days_of_week?: number[]
          id?: string
          last_run_at?: string | null
          posts_per_day?: number
          time_of_day?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_schedules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_social_accounts: {
        Row: {
          brand_id: string
          connected_at: string
          created_at: string
          id: string
          network: string
          network_unique_id: string | null
          nickname: string | null
          outstand_account_id: string
          pinterest_board_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          brand_id: string
          connected_at?: string
          created_at?: string
          id?: string
          network: string
          network_unique_id?: string | null
          nickname?: string | null
          outstand_account_id: string
          pinterest_board_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          brand_id?: string
          connected_at?: string
          created_at?: string
          id?: string
          network?: string
          network_unique_id?: string | null
          nickname?: string | null
          outstand_account_id?: string
          pinterest_board_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_social_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          brand_colors: Json
          brand_fonts: Json
          created_at: string
          drive_folder_id: string | null
          google_sheet_id: string | null
          google_sheet_url: string | null
          id: string
          knowledge_base: string | null
          logo_url: string | null
          name: string
          outstand_account_ids: Json
          owner_id: string
          reference_reel_url: string | null
          sheet_range: string | null
          sheet_tab: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          brand_colors?: Json
          brand_fonts?: Json
          created_at?: string
          drive_folder_id?: string | null
          google_sheet_id?: string | null
          google_sheet_url?: string | null
          id?: string
          knowledge_base?: string | null
          logo_url?: string | null
          name: string
          outstand_account_ids?: Json
          owner_id: string
          reference_reel_url?: string | null
          sheet_range?: string | null
          sheet_tab?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_colors?: Json
          brand_fonts?: Json
          created_at?: string
          drive_folder_id?: string | null
          google_sheet_id?: string | null
          google_sheet_url?: string | null
          id?: string
          knowledge_base?: string | null
          logo_url?: string | null
          name?: string
          outstand_account_ids?: Json
          owner_id?: string
          reference_reel_url?: string | null
          sheet_range?: string | null
          sheet_tab?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products_consumed: {
        Row: {
          brand_id: string
          consumed_at: string
          id: string
          product_row_key: string
        }
        Insert: {
          brand_id: string
          consumed_at?: string
          id?: string
          product_row_key: string
        }
        Update: {
          brand_id?: string
          consumed_at?: string
          id?: string
          product_row_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_consumed_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reaction_assets: {
        Row: {
          ai_tags: Json
          brand_id: string
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          kind: string
          label: string | null
          last_used_at: string | null
          owner_id: string
          storage_path: string
          updated_at: string
          use_count: number
          width: number | null
        }
        Insert: {
          ai_tags?: Json
          brand_id: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind: string
          label?: string | null
          last_used_at?: string | null
          owner_id: string
          storage_path: string
          updated_at?: string
          use_count?: number
          width?: number | null
        }
        Update: {
          ai_tags?: Json
          brand_id?: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind?: string
          label?: string | null
          last_used_at?: string | null
          owner_id?: string
          storage_path?: string
          updated_at?: string
          use_count?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reaction_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      reaction_reels: {
        Row: {
          arrangement: string | null
          brand_id: string
          caption: string | null
          created_at: string
          demo_asset_id: string | null
          error: string | null
          hashtags: string[]
          hook: string | null
          id: string
          outstand_post_ids: Json
          owner_id: string
          plan: Json
          published_at: string | null
          reaction_asset_id: string | null
          render_job_id: string | null
          status: string
          storage_path: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          arrangement?: string | null
          brand_id: string
          caption?: string | null
          created_at?: string
          demo_asset_id?: string | null
          error?: string | null
          hashtags?: string[]
          hook?: string | null
          id?: string
          outstand_post_ids?: Json
          owner_id: string
          plan?: Json
          published_at?: string | null
          reaction_asset_id?: string | null
          render_job_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          arrangement?: string | null
          brand_id?: string
          caption?: string | null
          created_at?: string
          demo_asset_id?: string | null
          error?: string | null
          hashtags?: string[]
          hook?: string | null
          id?: string
          outstand_post_ids?: Json
          owner_id?: string
          plan?: Json
          published_at?: string | null
          reaction_asset_id?: string | null
          render_job_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reaction_reels_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_reels_demo_asset_id_fkey"
            columns: ["demo_asset_id"]
            isOneToOne: false
            referencedRelation: "reaction_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_reels_reaction_asset_id_fkey"
            columns: ["reaction_asset_id"]
            isOneToOne: false
            referencedRelation: "reaction_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_reels_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      reels: {
        Row: {
          brand_id: string
          caption: string | null
          created_at: string
          drive_file_id: string | null
          drive_synced_at: string | null
          drive_url: string | null
          error: string | null
          hashtags: string[] | null
          hook: string | null
          id: string
          outstand_post_ids: Json
          product_row_key: string | null
          product_snapshot: Json | null
          published_at: string | null
          render_job_id: string | null
          render_provider_id: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["reel_status"]
          template_id: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          brand_id: string
          caption?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_synced_at?: string | null
          drive_url?: string | null
          error?: string | null
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          outstand_post_ids?: Json
          product_row_key?: string | null
          product_snapshot?: Json | null
          published_at?: string | null
          render_job_id?: string | null
          render_provider_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["reel_status"]
          template_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          brand_id?: string
          caption?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_synced_at?: string | null
          drive_url?: string | null
          error?: string | null
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          outstand_post_ids?: Json
          product_row_key?: string | null
          product_snapshot?: Json | null
          published_at?: string | null
          render_job_id?: string | null
          render_provider_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["reel_status"]
          template_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reels_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          attempts: number
          brand_id: string
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          id: string
          last_error: string | null
          logs: Json
          max_attempts: number
          props: Json
          reel_id: string | null
          status: string
          storage_path: string | null
          template_id: string
          updated_at: string
          worker_url: string | null
        }
        Insert: {
          attempts?: number
          brand_id: string
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          last_error?: string | null
          logs?: Json
          max_attempts?: number
          props?: Json
          reel_id?: string | null
          status?: string
          storage_path?: string | null
          template_id: string
          updated_at?: string
          worker_url?: string | null
        }
        Update: {
          attempts?: number
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          last_error?: string | null
          logs?: Json
          max_attempts?: number
          props?: Json
          reel_id?: string | null
          status?: string
          storage_path?: string | null
          template_id?: string
          updated_at?: string
          worker_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      reel_status:
        | "queued"
        | "generating_copy"
        | "rendering"
        | "ready"
        | "publishing"
        | "published"
        | "failed"
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
      reel_status: [
        "queued",
        "generating_copy",
        "rendering",
        "ready",
        "publishing",
        "published",
        "failed",
      ],
    },
  },
} as const
