// Generated from Supabase schema 2026-05-17. Do not edit by hand.
// Regenerate via: mcp__ec634f06-0412-45e3-a140-8114c929ed2e__generate_typescript_types
// Used by the Base44 mobile app + any other TS consumer of the Cypher Net DB.

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
      clip_submissions: {
        Row: {
          breaker_name: string | null
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          event_id: string
          event_name: string | null
          id: string
          message: string | null
          player_id: string
          status: string
          url: string
          user_display_name: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          breaker_name?: string | null
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          event_id: string
          event_name?: string | null
          id?: string
          message?: string | null
          player_id: string
          status?: string
          url: string
          user_display_name?: string | null
          user_email: string
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["clip_submissions"]["Insert"]>
        Relationships: []
      }
      judge_grants: {
        Row: {
          event_id: string
          granted_at: string | null
          judge_email: string
          judge_name: string | null
        }
        Insert: {
          event_id: string
          granted_at?: string | null
          judge_email: string
          judge_name?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["judge_grants"]["Insert"]>
        Relationships: []
      }
      profile_claims: {
        Row: {
          claim_kind: string
          created_at: string | null
          decided_at: string | null
          id: string
          message: string | null
          profile_id: string
          status: string
          user_display_name: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          claim_kind?: string
          created_at?: string | null
          decided_at?: string | null
          id?: string
          message?: string | null
          profile_id: string
          status?: string
          user_display_name?: string | null
          user_email: string
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["profile_claims"]["Insert"]>
        Relationships: []
      }
      profile_extras: {
        Row: {
          bio: string | null
          instagram: string | null
          profile_id: string
          tiktok: string | null
          updated_at: string | null
          updated_by: string | null
          youtube: string | null
        }
        Insert: {
          bio?: string | null
          instagram?: string | null
          profile_id: string
          tiktok?: string | null
          updated_at?: string | null
          updated_by?: string | null
          youtube?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["profile_extras"]["Insert"]>
        Relationships: []
      }
      profile_removal_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          profile_id: string
          profile_name: string | null
          reason: string
          status: string
          user_display_name: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          profile_id: string
          profile_name?: string | null
          reason: string
          status?: string
          user_display_name?: string | null
          user_email: string
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["profile_removal_requests"]["Insert"]>
        Relationships: []
      }
      user_data: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: Partial<Database["public"]["Tables"]["user_data"]["Insert"]>
        Relationships: []
      }
      watchlist: {
        Row: {
          added_at: string | null
          event_id: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          event_id: string
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["watchlist"]["Insert"]>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
