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
          brands_count: number
          created_at: string
          current_period_end: string | null
          deleted_at: string | null
          display_name: string | null
          id: string
          lemonsqueezy_customer_id: string | null
          lemonsqueezy_subscription_id: string | null
          plan_status: string
          plan_tier: string
          posts_used_this_period: number
          trial_ends_at: string | null
        }
        Insert: {
          brands_count?: number
          created_at?: string
          current_period_end?: string | null
          deleted_at?: string | null
          display_name?: string | null
          id: string
          lemonsqueezy_customer_id?: string | null
          lemonsqueezy_subscription_id?: string | null
          plan_status?: string
          plan_tier?: string
          posts_used_this_period?: number
          trial_ends_at?: string | null
        }
        Update: {
          brands_count?: number
          created_at?: string
          current_period_end?: string | null
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          lemonsqueezy_customer_id?: string | null
          lemonsqueezy_subscription_id?: string | null
          plan_status?: string
          plan_tier?: string
          posts_used_this_period?: number
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          account_id: string | null
          action: string
          brand_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
        }
        Insert: {
          account_id?: string | null
          action: string
          brand_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
        }
        Update: {
          account_id?: string | null
          action?: string
          brand_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_configs: {
        Row: {
          ai_seo_factors: Json | null
          approval_mode: string
          brand_id: string
          brand_voice: string | null
          forbidden_words: string[] | null
          internal_links_map: Json | null
          required_phrases: string[] | null
          seo_keywords_primary: string[] | null
          seo_keywords_secondary: string[] | null
          style_guide: string | null
          tone_attributes: string[] | null
          trigger_events: string[] | null
          updated_at: string
          voc_desired_outcomes: Json | null
          voc_pain_points: Json | null
          voice_samples: Json
        }
        Insert: {
          ai_seo_factors?: Json | null
          approval_mode?: string
          brand_id: string
          brand_voice?: string | null
          forbidden_words?: string[] | null
          internal_links_map?: Json | null
          required_phrases?: string[] | null
          seo_keywords_primary?: string[] | null
          seo_keywords_secondary?: string[] | null
          style_guide?: string | null
          tone_attributes?: string[] | null
          trigger_events?: string[] | null
          updated_at?: string
          voc_desired_outcomes?: Json | null
          voc_pain_points?: Json | null
          voice_samples?: Json
        }
        Update: {
          ai_seo_factors?: Json | null
          approval_mode?: string
          brand_id?: string
          brand_voice?: string | null
          forbidden_words?: string[] | null
          internal_links_map?: Json | null
          required_phrases?: string[] | null
          seo_keywords_primary?: string[] | null
          seo_keywords_secondary?: string[] | null
          style_guide?: string | null
          tone_attributes?: string[] | null
          trigger_events?: string[] | null
          updated_at?: string
          voc_desired_outcomes?: Json | null
          voc_pain_points?: Json | null
          voice_samples?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brand_configs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_oauth_tokens: {
        Row: {
          account_handle: string | null
          brand_id: string
          connected_at: string
          expires_at: string | null
          id: string
          platform: string
          scopes: string[]
          status: string
          vault_secret_id: string | null
        }
        Insert: {
          account_handle?: string | null
          brand_id: string
          connected_at?: string
          expires_at?: string | null
          id?: string
          platform: string
          scopes?: string[]
          status?: string
          vault_secret_id?: string | null
        }
        Update: {
          account_handle?: string | null
          brand_id?: string
          connected_at?: string
          expires_at?: string | null
          id?: string
          platform?: string
          scopes?: string[]
          status?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_oauth_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          account_id: string
          additional_languages: string[]
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          industry: string | null
          name: string
          primary_language: string
          slug: string
          updated_at: string
          website_url: string | null
          wizard_completed: boolean
          wizard_step: number
        }
        Insert: {
          account_id: string
          additional_languages?: string[]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          name: string
          primary_language?: string
          slug: string
          updated_at?: string
          website_url?: string | null
          wizard_completed?: boolean
          wizard_step?: number
        }
        Update: {
          account_id?: string
          additional_languages?: string[]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          name?: string
          primary_language?: string
          slug?: string
          updated_at?: string
          website_url?: string | null
          wizard_completed?: boolean
          wizard_step?: number
        }
        Relationships: [
          {
            foreignKeyName: "brands_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dataforseo_cache: {
        Row: {
          cache_key: string
          created_at: string
          endpoint: string
          expires_at: string
          id: string
          query_params: Json
          response_data: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          endpoint: string
          expires_at: string
          id?: string
          query_params: Json
          response_data: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          endpoint?: string
          expires_at?: string
          id?: string
          query_params?: Json
          response_data?: Json
        }
        Relationships: []
      }
      detection_dataset: {
        Row: {
          account_id: string
          created_at: string
          id: string
          pangram_breakdown: Json | null
          post_id: string | null
          score: number
          source: string
          text: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          pangram_breakdown?: Json | null
          post_id?: string | null
          score: number
          source: string
          text: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          pangram_breakdown?: Json | null
          post_id?: string | null
          score?: number
          source?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "detection_dataset_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detection_dataset_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          content_markdown: string | null
          content_text: string | null
          cover_image_url: string | null
          created_at: string
          cta_url: string | null
          detection_breakdown: Json | null
          detection_score: number | null
          external_post_id: string | null
          external_post_url: string | null
          hashtags: string[] | null
          id: string
          image_generation_method: string | null
          inline_image_urls: string[] | null
          language: string
          metrics: Json | null
          metrics_updated_at: string | null
          platform: string
          published_at: string | null
          research_keywords: string[] | null
          research_topic: string | null
          scheduled_for: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          content_markdown?: string | null
          content_text?: string | null
          cover_image_url?: string | null
          created_at?: string
          cta_url?: string | null
          detection_breakdown?: Json | null
          detection_score?: number | null
          external_post_id?: string | null
          external_post_url?: string | null
          hashtags?: string[] | null
          id?: string
          image_generation_method?: string | null
          inline_image_urls?: string[] | null
          language?: string
          metrics?: Json | null
          metrics_updated_at?: string | null
          platform: string
          published_at?: string | null
          research_keywords?: string[] | null
          research_topic?: string | null
          scheduled_for?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          content_markdown?: string | null
          content_text?: string | null
          cover_image_url?: string | null
          created_at?: string
          cta_url?: string | null
          detection_breakdown?: Json | null
          detection_score?: number | null
          external_post_id?: string | null
          external_post_url?: string | null
          hashtags?: string[] | null
          id?: string
          image_generation_method?: string | null
          inline_image_urls?: string[] | null
          language?: string
          metrics?: Json | null
          metrics_updated_at?: string | null
          platform?: string
          published_at?: string | null
          research_keywords?: string[] | null
          research_topic?: string | null
          scheduled_for?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
