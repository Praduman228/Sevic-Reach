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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_draft_runs: {
        Row: {
          acknowledged_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          firm_id: string
          id: string
          kind: string
          needs_input: Json
          offer_card: string
          offer_plan: Json
          output: Json
          stage: Database["public"]["Enums"]["firm_stage"]
          warnings: Json
        }
        Insert: {
          acknowledged_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          firm_id: string
          id?: string
          kind: string
          needs_input?: Json
          offer_card?: string
          offer_plan: Json
          output?: Json
          stage: Database["public"]["Enums"]["firm_stage"]
          warnings?: Json
        }
        Update: {
          acknowledged_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          firm_id?: string
          id?: string
          kind?: string
          needs_input?: Json
          offer_card?: string
          offer_plan?: Json
          output?: Json
          stage?: Database["public"]["Enums"]["firm_stage"]
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_draft_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "firm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_draft_runs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_firms: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          error: string | null
          firm_id: string
          fit_score: number | null
          id: string
          is_test: boolean
          missing: string[]
          phase: string
          processed_at: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          error?: string | null
          firm_id: string
          fit_score?: number | null
          id?: string
          is_test?: boolean
          missing?: string[]
          phase?: string
          processed_at?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          error?: string | null
          firm_id?: string
          fit_score?: number | null
          id?: string
          is_test?: boolean
          missing?: string[]
          phase?: string
          processed_at?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_firms_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_firms_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channels: string[]
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          last_run_at: string | null
          launched_at: string | null
          lock_until: string | null
          motto: string
          name: string
          pause_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channels?: string[]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_run_at?: string | null
          launched_at?: string | null
          lock_until?: string | null
          motto?: string
          name: string
          pause_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channels?: string[]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_run_at?: string | null
          launched_at?: string | null
          lock_until?: string | null
          motto?: string
          name?: string
          pause_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_sequence_deliveries: {
        Row: {
          address: string
          channel: string
          contact_name: string
          created_at: string
          error: string | null
          id: string
          provider_message_id: string | null
          sent_at: string | null
          sequence_id: string
          status: string
        }
        Insert: {
          address: string
          channel: string
          contact_name?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          sequence_id: string
          status?: string
        }
        Update: {
          address?: string
          channel?: string
          contact_name?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_delivery_sequence_fk"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "contact_sequence_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_sequence_messages: {
        Row: {
          ai_touch_id: string | null
          approved_at: string | null
          contact_id: string | null
          created_at: string
          email_ai_run_id: string | null
          email_body: string
          email_contact_ids: string[] | null
          email_sent_at: string | null
          email_status: string
          email_subject: string
          firm_id: string
          id: string
          label: string
          offset_minutes: number
          result: string | null
          scheduled_at: string | null
          sent_at: string | null
          stage: Database["public"]["Enums"]["firm_stage"]
          status: string
          step: number
          updated_at: string
          whatsapp_ai_run_id: string | null
          whatsapp_body: string
          whatsapp_contact_ids: string[] | null
          whatsapp_sent_at: string | null
          whatsapp_status: string
          whatsapp_template: string
        }
        Insert: {
          ai_touch_id?: string | null
          approved_at?: string | null
          contact_id?: string | null
          created_at?: string
          email_ai_run_id?: string | null
          email_body?: string
          email_contact_ids?: string[] | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string
          firm_id: string
          id?: string
          label: string
          offset_minutes?: number
          result?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          stage: Database["public"]["Enums"]["firm_stage"]
          status?: string
          step: number
          updated_at?: string
          whatsapp_ai_run_id?: string | null
          whatsapp_body?: string
          whatsapp_contact_ids?: string[] | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string
          whatsapp_template?: string
        }
        Update: {
          ai_touch_id?: string | null
          approved_at?: string | null
          contact_id?: string | null
          created_at?: string
          email_ai_run_id?: string | null
          email_body?: string
          email_contact_ids?: string[] | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string
          firm_id?: string
          id?: string
          label?: string
          offset_minutes?: number
          result?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          stage?: Database["public"]["Enums"]["firm_stage"]
          status?: string
          step?: number
          updated_at?: string
          whatsapp_ai_run_id?: string | null
          whatsapp_body?: string
          whatsapp_contact_ids?: string[] | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string
          whatsapp_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_sequence_firm_fk"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_sequence_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "firm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_sequence_messages_email_ai_run_id_fkey"
            columns: ["email_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_draft_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_sequence_messages_whatsapp_ai_run_id_fkey"
            columns: ["whatsapp_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_draft_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body: string
          created_at: string
          direction: string
          error: string | null
          firm_id: string | null
          from_email: string | null
          id: string
          provider_message_id: string | null
          sent_by: string | null
          stage: Database["public"]["Enums"]["firm_stage"] | null
          status: string
          subject: string
          to_email: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          error?: string | null
          firm_id?: string | null
          from_email?: string | null
          id?: string
          provider_message_id?: string | null
          sent_by?: string | null
          stage?: Database["public"]["Enums"]["firm_stage"] | null
          status?: string
          subject: string
          to_email: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          error?: string | null
          firm_id?: string | null
          from_email?: string | null
          id?: string
          provider_message_id?: string | null
          sent_by?: string | null
          stage?: Database["public"]["Enums"]["firm_stage"] | null
          status?: string
          subject?: string
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_contacts: {
        Row: {
          created_at: string
          designation: string | null
          email: string | null
          firm_id: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          designation?: string | null
          email?: string | null
          firm_id: string
          id?: string
          name?: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          designation?: string | null
          email?: string | null
          firm_id?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_contacts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_events: {
        Row: {
          created_at: string
          detail: string | null
          firm_id: string
          id: string
          kind: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          firm_id: string
          id?: string
          kind: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          firm_id?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_events_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_list_members: {
        Row: {
          created_at: string
          firm_id: string
          list_id: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          list_id: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_list_members_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "firm_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_lists: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      firm_personas: {
        Row: {
          firm_id: string
          id: string
          persona: string
          stage: Database["public"]["Enums"]["firm_stage"]
          updated_at: string
        }
        Insert: {
          firm_id: string
          id?: string
          persona?: string
          stage: Database["public"]["Enums"]["firm_stage"]
          updated_at?: string
        }
        Update: {
          firm_id?: string
          id?: string
          persona?: string
          stage?: Database["public"]["Enums"]["firm_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_personas_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_research: {
        Row: {
          brief: Json
          created_at: string
          created_by: string | null
          firm_id: string
          id: string
          sources: Json
        }
        Insert: {
          brief: Json
          created_at?: string
          created_by?: string | null
          firm_id: string
          id?: string
          sources?: Json
        }
        Update: {
          brief?: Json
          created_at?: string
          created_by?: string | null
          firm_id?: string
          id?: string
          sources?: Json
        }
        Relationships: [
          {
            foreignKeyName: "firm_research_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          external_id: string | null
          fit_max: number | null
          fit_score: number | null
          fit_tier: string | null
          id: string
          instagram: string | null
          lead_status: Database["public"]["Enums"]["lead_status"] | null
          lost_reason: string | null
          name: string
          notes: string | null
          owner_id: string | null
          persona: string | null
          phone: string | null
          reached_demo_at: string | null
          reached_discovery_at: string | null
          reached_paid_at: string | null
          reached_pilot_at: string | null
          source: Database["public"]["Enums"]["firm_source"]
          stage: Database["public"]["Enums"]["firm_stage"]
          stage_entered_at: string
          state: string | null
          team_size: number | null
          updated_at: string
          website: string | null
          whatsapp_opt_in: boolean
          whatsapp_opt_in_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          fit_max?: number | null
          fit_score?: number | null
          fit_tier?: string | null
          id?: string
          instagram?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          lost_reason?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          persona?: string | null
          phone?: string | null
          reached_demo_at?: string | null
          reached_discovery_at?: string | null
          reached_paid_at?: string | null
          reached_pilot_at?: string | null
          source?: Database["public"]["Enums"]["firm_source"]
          stage?: Database["public"]["Enums"]["firm_stage"]
          stage_entered_at?: string
          state?: string | null
          team_size?: number | null
          updated_at?: string
          website?: string | null
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          fit_max?: number | null
          fit_score?: number | null
          fit_tier?: string | null
          id?: string
          instagram?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          lost_reason?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          persona?: string | null
          phone?: string | null
          reached_demo_at?: string | null
          reached_discovery_at?: string | null
          reached_paid_at?: string | null
          reached_pilot_at?: string | null
          source?: Database["public"]["Enums"]["firm_source"]
          stage?: Database["public"]["Enums"]["firm_stage"]
          stage_entered_at?: string
          state?: string | null
          team_size?: number | null
          updated_at?: string
          website?: string | null
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
        }
        Relationships: []
      }
      lead_injection_candidates: {
        Row: {
          address: string | null
          business_name: string
          business_status: string | null
          category: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          existing_firm_id: string | null
          external_id: string | null
          id: string
          import_error: string | null
          imported: boolean
          imported_firm_id: string | null
          job_id: string
          maps_url: string | null
          phone: string | null
          provider_types: string[]
          source_url: string | null
          sources: string[]
          state: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          business_status?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          existing_firm_id?: string | null
          external_id?: string | null
          id?: string
          import_error?: string | null
          imported?: boolean
          imported_firm_id?: string | null
          job_id: string
          maps_url?: string | null
          phone?: string | null
          provider_types?: string[]
          source_url?: string | null
          sources?: string[]
          state?: string | null
          user_id?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          business_status?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          existing_firm_id?: string | null
          external_id?: string | null
          id?: string
          import_error?: string | null
          imported?: boolean
          imported_firm_id?: string | null
          job_id?: string
          maps_url?: string | null
          phone?: string | null
          provider_types?: string[]
          source_url?: string | null
          sources?: string[]
          state?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_injection_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "lead_injection_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_injection_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          keyword: string
          location: string
          provider_status: Json
          status: string
          total_existing: number
          total_found: number
          total_new: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          keyword: string
          location: string
          provider_status?: Json
          status?: string
          total_existing?: number
          total_found?: number
          total_new?: number
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          keyword?: string
          location?: string
          provider_status?: Json
          status?: string
          total_existing?: number
          total_found?: number
          total_new?: number
          user_id?: string
        }
        Relationships: []
      }
      offer_catalog_settings: {
        Row: {
          catalog: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          catalog?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          catalog?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sequence_channel_messages: {
        Row: {
          approved_at: string | null
          channel: string
          created_at: string
          email_body: string
          email_subject: string
          firm_id: string
          id: string
          label: string
          offset_minutes: number
          result: string | null
          review: Json
          scheduled_at: string | null
          sent_at: string | null
          stage: Database["public"]["Enums"]["firm_stage"]
          status: string
          step: number
          updated_at: string
          whatsapp_body: string
        }
        Insert: {
          approved_at?: string | null
          channel?: string
          created_at?: string
          email_body?: string
          email_subject?: string
          firm_id: string
          id?: string
          label: string
          offset_minutes?: number
          result?: string | null
          review?: Json
          scheduled_at?: string | null
          sent_at?: string | null
          stage: Database["public"]["Enums"]["firm_stage"]
          status?: string
          step: number
          updated_at?: string
          whatsapp_body?: string
        }
        Update: {
          approved_at?: string | null
          channel?: string
          created_at?: string
          email_body?: string
          email_subject?: string
          firm_id?: string
          id?: string
          label?: string
          offset_minutes?: number
          result?: string | null
          review?: Json
          scheduled_at?: string | null
          sent_at?: string | null
          stage?: Database["public"]["Enums"]["firm_stage"]
          status?: string
          step?: number
          updated_at?: string
          whatsapp_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_channel_messages_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_deliveries: {
        Row: {
          address: string
          channel: string
          contact_name: string
          created_at: string
          error: string | null
          id: string
          provider_message_id: string | null
          sent_at: string | null
          sequence_id: string
          status: string
        }
        Insert: {
          address: string
          channel: string
          contact_name?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          sequence_id: string
          status?: string
        }
        Update: {
          address?: string
          channel?: string
          contact_name?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_deliveries_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequence_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_messages: {
        Row: {
          ai_touch_id: string | null
          approved_at: string | null
          created_at: string
          email_ai_run_id: string | null
          email_body: string
          email_contact_ids: string[] | null
          email_sent_at: string | null
          email_status: string
          email_subject: string
          firm_id: string
          id: string
          label: string
          offset_minutes: number
          result: string | null
          scheduled_at: string | null
          sent_at: string | null
          stage: Database["public"]["Enums"]["firm_stage"]
          status: string
          step: number
          updated_at: string
          whatsapp_ai_run_id: string | null
          whatsapp_body: string
          whatsapp_contact_ids: string[] | null
          whatsapp_sent_at: string | null
          whatsapp_status: string
          whatsapp_template: string
        }
        Insert: {
          ai_touch_id?: string | null
          approved_at?: string | null
          created_at?: string
          email_ai_run_id?: string | null
          email_body?: string
          email_contact_ids?: string[] | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string
          firm_id: string
          id?: string
          label: string
          offset_minutes?: number
          result?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          stage: Database["public"]["Enums"]["firm_stage"]
          status?: string
          step: number
          updated_at?: string
          whatsapp_ai_run_id?: string | null
          whatsapp_body?: string
          whatsapp_contact_ids?: string[] | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string
          whatsapp_template?: string
        }
        Update: {
          ai_touch_id?: string | null
          approved_at?: string | null
          created_at?: string
          email_ai_run_id?: string | null
          email_body?: string
          email_contact_ids?: string[] | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string
          firm_id?: string
          id?: string
          label?: string
          offset_minutes?: number
          result?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          stage?: Database["public"]["Enums"]["firm_stage"]
          status?: string
          step?: number
          updated_at?: string
          whatsapp_ai_run_id?: string | null
          whatsapp_body?: string
          whatsapp_contact_ids?: string[] | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string
          whatsapp_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_messages_email_ai_run_id_fkey"
            columns: ["email_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_draft_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_messages_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_messages_whatsapp_ai_run_id_fkey"
            columns: ["whatsapp_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_draft_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_templates: {
        Row: {
          email_body: string
          email_subject: string
          stage: Database["public"]["Enums"]["firm_stage"]
          updated_at: string
          whatsapp_body: string
        }
        Insert: {
          email_body?: string
          email_subject?: string
          stage: Database["public"]["Enums"]["firm_stage"]
          updated_at?: string
          whatsapp_body?: string
        }
        Update: {
          email_body?: string
          email_subject?: string
          stage?: Database["public"]["Enums"]["firm_stage"]
          updated_at?: string
          whatsapp_body?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          auto: boolean
          completed_at: string | null
          created_at: string
          due_at: string
          firm_id: string
          id: string
          stage: Database["public"]["Enums"]["firm_stage"] | null
          title: string
        }
        Insert: {
          auto?: boolean
          completed_at?: string | null
          created_at?: string
          due_at: string
          firm_id: string
          id?: string
          stage?: Database["public"]["Enums"]["firm_stage"] | null
          title: string
        }
        Update: {
          auto?: boolean
          completed_at?: string | null
          created_at?: string
          due_at?: string
          firm_id?: string
          id?: string
          stage?: Database["public"]["Enums"]["firm_stage"] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
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
      whatsapp_messages: {
        Row: {
          body: string
          created_at: string
          direction: string
          error: string | null
          firm_id: string | null
          id: string
          phone: string
          provider_message_id: string | null
          sent_by: string | null
          stage: Database["public"]["Enums"]["firm_stage"] | null
          status: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          error?: string | null
          firm_id?: string | null
          id?: string
          phone: string
          provider_message_id?: string | null
          sent_by?: string | null
          stage?: Database["public"]["Enums"]["firm_stage"] | null
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          error?: string | null
          firm_id?: string | null
          id?: string
          phone?: string
          provider_message_id?: string | null
          sent_by?: string | null
          stage?: Database["public"]["Enums"]["firm_stage"] | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      firm_has_outgoing_send: { Args: { _firm_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      parse_firm_fit: {
        Args: { summary: string }
        Returns: {
          fit_max: number
          fit_score: number
          fit_tier: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "sales"
      firm_source:
        | "linkedin"
        | "email"
        | "referral"
        | "event"
        | "lead_injector"
        | "notion"
      firm_stage:
        | "backlog"
        | "outreach"
        | "discovery"
        | "demo"
        | "pilot"
        | "paid"
        | "customer"
        | "nurture"
        | "lost"
      lead_status: "hot" | "cold" | "junk"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "sales"],
      firm_source: [
        "linkedin",
        "email",
        "referral",
        "event",
        "lead_injector",
        "notion",
      ],
      firm_stage: [
        "backlog",
        "outreach",
        "discovery",
        "demo",
        "pilot",
        "paid",
        "customer",
        "nurture",
        "lost",
      ],
      lead_status: ["hot", "cold", "junk"],
    },
  },
} as const
