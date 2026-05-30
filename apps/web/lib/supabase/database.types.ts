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
          beta_access: boolean
          brands_count: number
          created_at: string
          current_period_end: string | null
          deleted_at: string | null
          display_name: string | null
          fal_flux_used_this_period: number
          id: string
          lemonsqueezy_customer_id: string | null
          lemonsqueezy_subscription_id: string | null
          plan_status: string
          plan_tier: string
          posts_used_this_period: number
          trial_ends_at: string | null
        }
        Insert: {
          beta_access?: boolean
          brands_count?: number
          created_at?: string
          current_period_end?: string | null
          deleted_at?: string | null
          display_name?: string | null
          fal_flux_used_this_period?: number
          id: string
          lemonsqueezy_customer_id?: string | null
          lemonsqueezy_subscription_id?: string | null
          plan_status?: string
          plan_tier?: string
          posts_used_this_period?: number
          trial_ends_at?: string | null
        }
        Update: {
          beta_access?: boolean
          brands_count?: number
          created_at?: string
          current_period_end?: string | null
          deleted_at?: string | null
          display_name?: string | null
          fal_flux_used_this_period?: number
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
          forbidden_claims: Json
          forbidden_words: string[] | null
          internal_links_map: Json | null
          locations: Json
          pricing: Json
          required_phrases: string[] | null
          seo_keywords_primary: string[] | null
          seo_keywords_secondary: string[] | null
          services: Json
          style_guide: string | null
          tone_attributes: string[] | null
          trigger_events: string[] | null
          updated_at: string
          voc_desired_outcomes: Json | null
          voc_pain_points: Json | null
          voice_fingerprint: Json | null
          voice_samples: Json
        }
        Insert: {
          ai_seo_factors?: Json | null
          approval_mode?: string
          brand_id: string
          brand_voice?: string | null
          forbidden_claims?: Json
          forbidden_words?: string[] | null
          internal_links_map?: Json | null
          locations?: Json
          pricing?: Json
          required_phrases?: string[] | null
          seo_keywords_primary?: string[] | null
          seo_keywords_secondary?: string[] | null
          services?: Json
          style_guide?: string | null
          tone_attributes?: string[] | null
          trigger_events?: string[] | null
          updated_at?: string
          voc_desired_outcomes?: Json | null
          voc_pain_points?: Json | null
          voice_fingerprint?: Json | null
          voice_samples?: Json
        }
        Update: {
          ai_seo_factors?: Json | null
          approval_mode?: string
          brand_id?: string
          brand_voice?: string | null
          forbidden_claims?: Json
          forbidden_words?: string[] | null
          internal_links_map?: Json | null
          locations?: Json
          pricing?: Json
          required_phrases?: string[] | null
          seo_keywords_primary?: string[] | null
          seo_keywords_secondary?: string[] | null
          services?: Json
          style_guide?: string | null
          tone_attributes?: string[] | null
          trigger_events?: string[] | null
          updated_at?: string
          voc_desired_outcomes?: Json | null
          voc_pain_points?: Json | null
          voice_fingerprint?: Json | null
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
      brand_platform_connections: {
        Row: {
          account_handle: string
          brand_id: string
          connected_at: string
          id: string
          last_error: string | null
          last_used_at: string | null
          metadata: Json
          platform: string
          status: string
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          account_handle: string
          brand_id: string
          connected_at?: string
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          metadata?: Json
          platform: string
          status?: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          account_handle?: string
          brand_id?: string
          connected_at?: string
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          metadata?: Json
          platform?: string
          status?: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_platform_connections_brand_id_fkey"
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
          industry_category_id: string | null
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
          industry_category_id?: string | null
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
          industry_category_id?: string | null
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
          {
            foreignKeyName: "brands_industry_category_id_fkey"
            columns: ["industry_category_id"]
            isOneToOne: false
            referencedRelation: "industry_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          app_scoped_user_id: string
          completed_at: string | null
          confirmation_code: string
          id: string
          internal_user_id: string | null
          requested_at: string
          source_platform: string
          status: string
        }
        Insert: {
          app_scoped_user_id: string
          completed_at?: string | null
          confirmation_code: string
          id?: string
          internal_user_id?: string | null
          requested_at?: string
          source_platform: string
          status?: string
        }
        Update: {
          app_scoped_user_id?: string
          completed_at?: string | null
          confirmation_code?: string
          id?: string
          internal_user_id?: string | null
          requested_at?: string
          source_platform?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_deletion_requests_internal_user_id_fkey"
            columns: ["internal_user_id"]
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
      industry_categories: {
        Row: {
          created_at: string
          id: string
          industry_group: string
          is_dogfood_anchor: boolean
          keywords: string[]
          name_en: string
          name_es: string | null
          name_ru: string
          searchable: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          industry_group: string
          is_dogfood_anchor?: boolean
          keywords?: string[]
          name_en: string
          name_es?: string | null
          name_ru: string
          searchable?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          industry_group?: string
          is_dogfood_anchor?: boolean
          keywords?: string[]
          name_en?: string
          name_es?: string | null
          name_ru?: string
          searchable?: string | null
        }
        Relationships: []
      }
      industry_requests: {
        Row: {
          account_id: string
          approved_category_id: string | null
          brand_id: string | null
          created_at: string
          email: string | null
          id: string
          query_text: string
          status: string
        }
        Insert: {
          account_id: string
          approved_category_id?: string | null
          brand_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          query_text: string
          status?: string
        }
        Update: {
          account_id?: string
          approved_category_id?: string | null
          brand_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          query_text?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "industry_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_requests_approved_category_id_fkey"
            columns: ["approved_category_id"]
            isOneToOne: false
            referencedRelation: "industry_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_requests_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_search_misses: {
        Row: {
          account_id: string
          brand_id: string | null
          clicked_other: boolean
          created_at: string
          id: string
          picked_index: number | null
          query_text: string
          top_5_ids: string[]
        }
        Insert: {
          account_id: string
          brand_id?: string | null
          clicked_other?: boolean
          created_at?: string
          id?: string
          picked_index?: number | null
          query_text: string
          top_5_ids?: string[]
        }
        Update: {
          account_id?: string
          brand_id?: string | null
          clicked_other?: boolean
          created_at?: string
          id?: string
          picked_index?: number | null
          query_text?: string
          top_5_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "industry_search_misses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_search_misses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      market_competitors: {
        Row: {
          added_by: string | null
          brand_id: string
          created_at: string
          domain: string
          id: string
          source: string
          status: string
          url: string
        }
        Insert: {
          added_by?: string | null
          brand_id: string
          created_at?: string
          domain: string
          id?: string
          source?: string
          status?: string
          url: string
        }
        Update: {
          added_by?: string | null
          brand_id?: string
          created_at?: string
          domain?: string
          id?: string
          source?: string
          status?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      market_differentiation: {
        Row: {
          brand_id: string
          common_themes: Json
          computed_at: string
          id: string
          model: string | null
          positioning_gaps: Json
          prompt_version: string | null
          source_domains: string[] | null
        }
        Insert: {
          brand_id: string
          common_themes?: Json
          computed_at?: string
          id?: string
          model?: string | null
          positioning_gaps?: Json
          prompt_version?: string | null
          source_domains?: string[] | null
        }
        Update: {
          brand_id?: string
          common_themes?: Json
          computed_at?: string
          id?: string
          model?: string | null
          positioning_gaps?: Json
          prompt_version?: string | null
          source_domains?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "market_differentiation_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      market_scrape_cache: {
        Row: {
          domain: string
          expires_at: string
          extracted: Json | null
          fetched_at: string
          id: string
          robots_allowed: boolean | null
          status_code: number | null
        }
        Insert: {
          domain: string
          expires_at?: string
          extracted?: Json | null
          fetched_at?: string
          id?: string
          robots_allowed?: boolean | null
          status_code?: number | null
        }
        Update: {
          domain?: string
          expires_at?: string
          extracted?: Json | null
          fetched_at?: string
          id?: string
          robots_allowed?: boolean | null
          status_code?: number | null
        }
        Relationships: []
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
      proof_items: {
        Row: {
          asset_url: string | null
          body: string
          brand_id: string
          created_at: string
          id: string
          kind: string
          source: string | null
          updated_at: string
          verifiable: boolean
        }
        Insert: {
          asset_url?: string | null
          body: string
          brand_id: string
          created_at?: string
          id?: string
          kind: string
          source?: string | null
          updated_at?: string
          verifiable?: boolean
        }
        Update: {
          asset_url?: string | null
          body?: string
          brand_id?: string
          created_at?: string
          id?: string
          kind?: string
          source?: string | null
          updated_at?: string
          verifiable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "proof_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          brand_id: string
          connection_id: string | null
          error_code: string | null
          error_message: string | null
          external_post_id: string | null
          id: string
          inngest_event_id: string | null
          oauth_token_id: string | null
          platform: string
          post_id: string
          retry_after_at: string | null
          status: string
          succeeded_at: string | null
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          attempted_at?: string
          brand_id: string
          connection_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          inngest_event_id?: string | null
          oauth_token_id?: string | null
          platform: string
          post_id: string
          retry_after_at?: string | null
          status: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          brand_id?: string
          connection_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          inngest_event_id?: string | null
          oauth_token_id?: string | null
          platform?: string
          post_id?: string
          retry_after_at?: string | null
          status?: string
          succeeded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_attempts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_attempts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "brand_platform_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_attempts_oauth_token_id_fkey"
            columns: ["oauth_token_id"]
            isOneToOne: false
            referencedRelation: "brand_oauth_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_attempts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_candidates: {
        Row: {
          brand_id: string
          created_at: string
          degraded_run: boolean
          expires_at: string
          freshness_score: number | null
          id: string
          impressions_count: number
          last_shown_at: string | null
          post_id: string | null
          score: number | null
          source: string
          source_metadata: Json
          topic_text: string
          used_at: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          degraded_run?: boolean
          expires_at?: string
          freshness_score?: number | null
          id?: string
          impressions_count?: number
          last_shown_at?: string | null
          post_id?: string | null
          score?: number | null
          source: string
          source_metadata?: Json
          topic_text: string
          used_at?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          degraded_run?: boolean
          expires_at?: string
          freshness_score?: number | null
          id?: string
          impressions_count?: number
          last_shown_at?: string | null
          post_id?: string | null
          score?: number | null
          source?: string
          source_metadata?: Json
          topic_text?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_candidates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_candidates_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      filter_unused_topic_texts: {
        Args: {
          p_brand_id: string
          p_candidate_texts: string[]
          p_history_limit?: number
          p_threshold?: number
        }
        Returns: string[]
      }
      immutable_array_to_string: {
        Args: { arr: string[]; delim: string }
        Returns: string
      }
      increment_fal_flux_atomic: {
        Args: { p_account_id: string; p_limit: number }
        Returns: boolean
      }
      increment_topic_impressions: {
        Args: { p_candidate_ids: string[] }
        Returns: undefined
      }
      insert_post_and_mark_candidate: {
        Args: {
          p_brand_id: string
          p_candidate_id?: string
          p_content_text: string
          p_detection_breakdown: Json
          p_detection_score: number
          p_language: string
          p_platform: string
          p_research_topic?: string
          p_source_type: string
          p_status: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_industry_search_miss: {
        Args: {
          p_brand_id?: string
          p_clicked_other?: boolean
          p_picked_index?: number
          p_query_text: string
          p_top_5_ids?: string[]
        }
        Returns: undefined
      }
      search_industries: {
        Args: { p_lang?: string; p_limit?: number; p_query: string }
        Returns: {
          id: string
          industry_group: string
          name_en: string
          name_ru: string
          similarity: number
        }[]
      }
      submit_industry_request: {
        Args: { p_brand_id?: string; p_email?: string; p_query_text: string }
        Returns: {
          account_id: string
          approved_category_id: string | null
          brand_id: string | null
          created_at: string
          email: string | null
          id: string
          query_text: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "industry_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vault_create_secret: {
        Args: { p_description?: string; p_name: string; p_secret: Json }
        Returns: string
      }
      vault_delete_secret: { Args: { p_id: string }; Returns: undefined }
      vault_read_secret: { Args: { p_id: string }; Returns: Json }
      vault_update_secret: {
        Args: { p_id: string; p_secret: Json }
        Returns: undefined
      }
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
