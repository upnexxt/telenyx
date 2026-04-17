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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_enhancement_suggestions: {
        Row: {
          created_at: string | null
          description: string
          id: string
          related_call_ids: string[] | null
          status: Database["public"]["Enums"]["suggestion_status_type"] | null
          suggestion_type: Database["public"]["Enums"]["suggestion_type_enum"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          related_call_ids?: string[] | null
          status?: Database["public"]["Enums"]["suggestion_status_type"] | null
          suggestion_type: Database["public"]["Enums"]["suggestion_type_enum"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          related_call_ids?: string[] | null
          status?: Database["public"]["Enums"]["suggestion_status_type"] | null
          suggestion_type?: Database["public"]["Enums"]["suggestion_type_enum"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_enhancement_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string | null
          customer_id: string
          customer_name: string | null
          customer_phone: string | null
          date: string | null
          duration_minutes: number | null
          employee_id: string
          end_time: string
          id: string
          notes: string | null
          service_id: string
          service_name: string | null
          session_id: string | null
          source: Database["public"]["Enums"]["appointment_source_type"] | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status_type"] | null
          tenant_id: string
          time: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          customer_name?: string | null
          customer_phone?: string | null
          date?: string | null
          duration_minutes?: number | null
          employee_id: string
          end_time: string
          id?: string
          notes?: string | null
          service_id: string
          service_name?: string | null
          session_id?: string | null
          source?: Database["public"]["Enums"]["appointment_source_type"] | null
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status_type"] | null
          tenant_id: string
          time?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          customer_name?: string | null
          customer_phone?: string | null
          date?: string | null
          duration_minutes?: number | null
          employee_id?: string
          end_time?: string
          id?: string
          notes?: string | null
          service_id?: string
          service_name?: string | null
          session_id?: string | null
          source?: Database["public"]["Enums"]["appointment_source_type"] | null
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status_type"] | null
          tenant_id?: string
          time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_closed: boolean | null
          start_time: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_closed?: boolean | null
          start_time: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_closed?: boolean | null
          start_time?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours_exceptions: {
        Row: {
          created_at: string | null
          date: string
          end_time: string | null
          id: string
          is_closed: boolean
          note: string | null
          start_time: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          note?: string | null
          start_time?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          note?: string | null
          start_time?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          created_at: string | null
          customer_id: string | null
          duration_seconds: number | null
          end_time: string | null
          id: string
          start_time: string
          status: Database["public"]["Enums"]["call_status_type"] | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          start_time: string
          status?: Database["public"]["Enums"]["call_status_type"] | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["call_status_type"] | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      call_review_sessions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          outcome: string | null
          review_status: string | null
          session_id: string
          tenant_id: string
          transcript: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          outcome?: string | null
          review_status?: string | null
          session_id: string
          tenant_id: string
          transcript?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          outcome?: string | null
          review_status?: string | null
          session_id?: string
          tenant_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_review_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      call_traces: {
        Row: {
          call_log_id: string | null
          content: Json
          correlation_id: string | null
          created_at: string | null
          id: string
          step_type: Database["public"]["Enums"]["step_type_enum"]
          tenant_id: string
          timestamp: string | null
        }
        Insert: {
          call_log_id?: string | null
          content: Json
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          step_type: Database["public"]["Enums"]["step_type_enum"]
          tenant_id: string
          timestamp?: string | null
        }
        Update: {
          call_log_id?: string | null
          content?: Json
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          step_type?: Database["public"]["Enums"]["step_type_enum"]
          tenant_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_traces_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_traces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcripts: {
        Row: {
          call_control_id: string | null
          created_at: string | null
          ended_at: string | null
          id: string
          session_id: string | null
          speaker: string | null
          started_at: string | null
          tenant_id: string | null
          text: string
          token_count: number | null
          turn_index: number | null
        }
        Insert: {
          call_control_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          session_id?: string | null
          speaker?: string | null
          started_at?: string | null
          tenant_id?: string | null
          text: string
          token_count?: number | null
          turn_index?: number | null
        }
        Update: {
          call_control_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          session_id?: string | null
          speaker?: string | null
          started_at?: string | null
          tenant_id?: string | null
          text?: string
          token_count?: number | null
          turn_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_feedback: {
        Row: {
          ai_message: string
          category: string | null
          context: Json | null
          created_at: string
          feedback_comment: string | null
          feedback_type: string
          id: string
          log_entry_id: string | null
          message_index: number
          reviewed_by: string | null
          session_id: string
          tenant_id: string
        }
        Insert: {
          ai_message: string
          category?: string | null
          context?: Json | null
          created_at?: string
          feedback_comment?: string | null
          feedback_type: string
          id?: string
          log_entry_id?: string | null
          message_index: number
          reviewed_by?: string | null
          session_id: string
          tenant_id: string
        }
        Update: {
          ai_message?: string
          category?: string | null
          context?: Json | null
          created_at?: string
          feedback_comment?: string | null
          feedback_type?: string
          id?: string
          log_entry_id?: string | null
          message_index?: number
          reviewed_by?: string | null
          session_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_logs: {
        Row: {
          created_at: string
          id: string
          message: string
          message_index: number
          metadata: Json | null
          role: string
          session_id: string
          tenant_id: string | null
          timestamp: string | null
          tool_input: Json | null
          tool_name: string | null
          tool_output: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          message_index?: number
          metadata?: Json | null
          role: string
          session_id: string
          tenant_id?: string | null
          timestamp?: string | null
          tool_input?: Json | null
          tool_name?: string | null
          tool_output?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          message_index?: number
          metadata?: Json | null
          role?: string
          session_id?: string
          tenant_id?: string | null
          timestamp?: string | null
          tool_input?: Json | null
          tool_name?: string | null
          tool_output?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sessions: {
        Row: {
          channel: string
          context: Json
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          last_activity_at: string
          metadata: Json | null
          metrics: Json | null
          outcome: string | null
          phase: string
          session_id: string
          started_at: string
          state: Json | null
          status: string | null
          tenant_id: string
          total_cost_eur: number | null
          total_tokens: number | null
          transcript_summary: string | null
          updated_at: string | null
        }
        Insert: {
          channel?: string
          context?: Json
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          metadata?: Json | null
          metrics?: Json | null
          outcome?: string | null
          phase?: string
          session_id: string
          started_at?: string
          state?: Json | null
          status?: string | null
          tenant_id: string
          total_cost_eur?: number | null
          total_tokens?: number | null
          transcript_summary?: string | null
          updated_at?: string | null
        }
        Update: {
          channel?: string
          context?: Json
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          metadata?: Json | null
          metrics?: Json | null
          outcome?: string | null
          phase?: string
          session_id?: string
          started_at?: string
          state?: Json | null
          status?: string | null
          tenant_id?: string
          total_cost_eur?: number | null
          total_tokens?: number | null
          transcript_summary?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_prompts: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          prompt_text: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          prompt_text: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          prompt_text?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_prompts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_history: {
        Row: {
          channel: string | null
          created_at: string
          customer_id: string
          customer_since: string | null
          first_visit: boolean | null
          id: string
          interaction_type: string | null
          last_employee_name: string | null
          last_service: string | null
          last_session_id: string | null
          last_visit: string | null
          notes: string | null
          phone_number: string | null
          preferred_service_ids: string[] | null
          tenant_id: string
          total_visits: number | null
          updated_at: string
          visit_date: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          customer_id: string
          customer_since?: string | null
          first_visit?: boolean | null
          id?: string
          interaction_type?: string | null
          last_employee_name?: string | null
          last_service?: string | null
          last_session_id?: string | null
          last_visit?: string | null
          notes?: string | null
          phone_number?: string | null
          preferred_service_ids?: string[] | null
          tenant_id: string
          total_visits?: number | null
          updated_at?: string
          visit_date?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          customer_id?: string
          customer_since?: string | null
          first_visit?: boolean | null
          id?: string
          interaction_type?: string | null
          last_employee_name?: string | null
          last_service?: string | null
          last_session_id?: string | null
          last_visit?: string | null
          notes?: string | null
          phone_number?: string | null
          preferred_service_ids?: string[] | null
          tenant_id?: string
          total_visits?: number | null
          updated_at?: string
          visit_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          last_visit_date: string | null
          notes: string | null
          phone: string
          phone_normalized: string | null
          preferences: Json | null
          preferred_employee_id: string | null
          preferred_service_ids: string[] | null
          tenant_id: string
          total_no_shows: number | null
          total_visits: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_visit_date?: string | null
          notes?: string | null
          phone: string
          phone_normalized?: string | null
          preferences?: Json | null
          preferred_employee_id?: string | null
          preferred_service_ids?: string[] | null
          tenant_id: string
          total_no_shows?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_visit_date?: string | null
          notes?: string | null
          phone?: string
          phone_normalized?: string | null
          preferences?: Json | null
          preferred_employee_id?: string | null
          preferred_service_ids?: string[] | null
          tenant_id?: string
          total_no_shows?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_configs: {
        Row: {
          config: Json
          created_at: string | null
          custom_prompt: string | null
          id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          custom_prompt?: string | null
          id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          custom_prompt?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_presets: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          name: string
          saved_at: number
          tenant_id: string
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          name: string
          saved_at: number
          tenant_id: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          name?: string
          saved_at?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_session_tool_calls: {
        Row: {
          args: Json | null
          created_at: string | null
          duration_ms: number
          error: string | null
          id: string
          result: Json | null
          session_id: string
          success: boolean
          tenant_id: string
          timestamp: number
          tool_name: string
        }
        Insert: {
          args?: Json | null
          created_at?: string | null
          duration_ms?: number
          error?: string | null
          id?: string
          result?: Json | null
          session_id: string
          success?: boolean
          tenant_id: string
          timestamp: number
          tool_name: string
        }
        Update: {
          args?: Json | null
          created_at?: string | null
          duration_ms?: number
          error?: string | null
          id?: string
          result?: Json | null
          session_id?: string
          success?: boolean
          tenant_id?: string
          timestamp?: number
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_session_tool_calls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dev_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_session_tool_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_session_transcript: {
        Row: {
          created_at: string | null
          id: string
          latency_ms: number | null
          role: string
          session_id: string
          session_init_data: Json | null
          tenant_id: string
          text: string
          timestamp: number
          tool_args: Json | null
          tool_name: string | null
          tool_query: string | null
          tool_query_result: Json | null
          tool_result: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          latency_ms?: number | null
          role: string
          session_id: string
          session_init_data?: Json | null
          tenant_id: string
          text?: string
          timestamp: number
          tool_args?: Json | null
          tool_name?: string | null
          tool_query?: string | null
          tool_query_result?: Json | null
          tool_result?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          role?: string
          session_id?: string
          session_init_data?: Json | null
          tenant_id?: string
          text?: string
          timestamp?: number
          tool_args?: Json | null
          tool_name?: string | null
          tool_query?: string | null
          tool_query_result?: Json | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_session_transcript_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dev_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_session_transcript_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_sessions: {
        Row: {
          ai_speaking_history: Json | null
          config: Json
          created_at: string | null
          ended_at: number | null
          id: string
          session_init: Json | null
          started_at: number
          stats: Json
          tenant_id: string
          user_volume_history: Json | null
        }
        Insert: {
          ai_speaking_history?: Json | null
          config?: Json
          created_at?: string | null
          ended_at?: number | null
          id: string
          session_init?: Json | null
          started_at: number
          stats?: Json
          tenant_id: string
          user_volume_history?: Json | null
        }
        Update: {
          ai_speaking_history?: Json | null
          config?: Json
          created_at?: string | null
          ended_at?: number | null
          id?: string
          session_init?: Json | null
          started_at?: number
          stats?: Json
          tenant_id?: string
          user_volume_history?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_blocks: {
        Row: {
          created_at: string | null
          created_by_employee: boolean | null
          date: string
          employee_id: string
          end_time: string
          id: string
          is_recurring: boolean | null
          label: string | null
          recurrence_day_of_week: number | null
          start_time: string
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          created_by_employee?: boolean | null
          date: string
          employee_id: string
          end_time: string
          id?: string
          is_recurring?: boolean | null
          label?: string | null
          recurrence_day_of_week?: number | null
          start_time: string
          tenant_id: string
          type?: string
        }
        Update: {
          created_at?: string | null
          created_by_employee?: boolean | null
          date?: string
          employee_id?: string
          end_time?: string
          id?: string
          is_recurring?: boolean | null
          label?: string | null
          recurrence_day_of_week?: number | null
          start_time?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_blocks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          document_type: string
          employee_id: string
          expires_at: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          tenant_id: string
          title: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          document_type: string
          employee_id: string
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          tenant_id: string
          title?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          document_type?: string
          employee_id?: string
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          tenant_id?: string
          title?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_employment_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_date: string
          employee_id: string
          end_date: string | null
          event_type: string
          id: string
          new_value: string | null
          note: string | null
          previous_value: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_date: string
          employee_id: string
          end_date?: string | null
          event_type: string
          id?: string
          new_value?: string | null
          note?: string | null
          previous_value?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          end_date?: string | null
          event_type?: string
          id?: string
          new_value?: string | null
          note?: string | null
          previous_value?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_employment_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_feature_overrides: {
        Row: {
          created_at: string | null
          employee_id: string
          enabled: boolean
          feature_key: string
          id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          enabled: boolean
          feature_key: string
          id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_feature_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_feature_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_performance_reviews: {
        Row: {
          comments: string | null
          created_at: string | null
          employee_id: string
          goals: string | null
          id: string
          improvements: string | null
          rating_communication: number | null
          rating_leadership: number | null
          rating_overall: number | null
          rating_reliability: number | null
          rating_technical: number | null
          review_date: string
          review_period_end: string | null
          review_period_start: string | null
          review_type: string | null
          reviewed_by: string | null
          strengths: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          employee_id: string
          goals?: string | null
          id?: string
          improvements?: string | null
          rating_communication?: number | null
          rating_leadership?: number | null
          rating_overall?: number | null
          rating_reliability?: number | null
          rating_technical?: number | null
          review_date: string
          review_period_end?: string | null
          review_period_start?: string | null
          review_type?: string | null
          reviewed_by?: string | null
          strengths?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          employee_id?: string
          goals?: string | null
          id?: string
          improvements?: string | null
          rating_communication?: number | null
          rating_leadership?: number | null
          rating_overall?: number | null
          rating_reliability?: number | null
          rating_technical?: number | null
          review_date?: string
          review_period_end?: string | null
          review_period_start?: string | null
          review_type?: string | null
          reviewed_by?: string | null
          strengths?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_performance_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_performance_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_services: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          service_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          service_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_sick_leave: {
        Row: {
          created_at: string | null
          days_count: number
          doctor_note_provided: boolean | null
          employee_id: string
          end_date: string
          id: string
          is_emergency: boolean | null
          is_work_related: boolean | null
          note: string | null
          occupational_health_contacted: boolean | null
          reason: string | null
          sent_home_at: string | null
          start_date: string
          status: string | null
          tenant_id: string
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          days_count?: number
          doctor_note_provided?: boolean | null
          employee_id: string
          end_date: string
          id?: string
          is_emergency?: boolean | null
          is_work_related?: boolean | null
          note?: string | null
          occupational_health_contacted?: boolean | null
          reason?: string | null
          sent_home_at?: string | null
          start_date: string
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          year?: number
        }
        Update: {
          created_at?: string | null
          days_count?: number
          doctor_note_provided?: boolean | null
          employee_id?: string
          end_date?: string
          id?: string
          is_emergency?: boolean | null
          is_work_related?: boolean | null
          note?: string | null
          occupational_health_contacted?: boolean | null
          reason?: string | null
          sent_home_at?: string | null
          start_date?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_sick_leave_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_sick_leave_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_skills: {
        Row: {
          created_at: string | null
          employee_id: string
          expires_at: string | null
          id: string
          level: string | null
          obtained_at: string | null
          skill_category: string | null
          skill_name: string
          tenant_id: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          expires_at?: string | null
          id?: string
          level?: string | null
          obtained_at?: string | null
          skill_category?: string | null
          skill_name: string
          tenant_id: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          expires_at?: string | null
          id?: string
          level?: string | null
          obtained_at?: string | null
          skill_category?: string | null
          skill_name?: string
          tenant_id?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_skills_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_skills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_time_logs: {
        Row: {
          break_minutes: number | null
          clock_in: string
          clock_out: string | null
          created_at: string | null
          date: string
          employee_id: string
          id: string
          note: string | null
          tenant_id: string
          total_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          break_minutes?: number | null
          clock_in: string
          clock_out?: string | null
          created_at?: string | null
          date: string
          employee_id: string
          id?: string
          note?: string | null
          tenant_id: string
          total_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          break_minutes?: number | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          id?: string
          note?: string | null
          tenant_id?: string
          total_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_time_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_time_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_vacation_bookings: {
        Row: {
          created_at: string | null
          days_count: number
          employee_id: string
          end_date: string
          id: string
          note: string | null
          start_date: string
          status: string | null
          tenant_id: string
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          days_count?: number
          employee_id: string
          end_date: string
          id?: string
          note?: string | null
          start_date: string
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          year?: number
        }
        Update: {
          created_at?: string | null
          days_count?: number
          employee_id?: string
          end_date?: string
          id?: string
          note?: string | null
          start_date?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_vacation_bookings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_vacation_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_vacation_days: {
        Row: {
          created_at: string | null
          days_total: number
          days_used: number
          employee_id: string
          end_date: string | null
          id: string
          note: string | null
          start_date: string | null
          tenant_id: string
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          days_total?: number
          days_used?: number
          employee_id: string
          end_date?: string | null
          id?: string
          note?: string | null
          start_date?: string | null
          tenant_id: string
          updated_at?: string | null
          year?: number
        }
        Update: {
          created_at?: string | null
          days_total?: number
          days_used?: number
          employee_id?: string
          end_date?: string | null
          id?: string
          note?: string | null
          start_date?: string | null
          tenant_id?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_vacation_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_vacation_days_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_working_hours: {
        Row: {
          created_at: string | null
          day_of_week: number
          employee_id: string
          end_time: string
          id: string
          start_time: string
          tenant_id: string
          updated_at: string | null
          week_start_date: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          employee_id: string
          end_time: string
          id?: string
          start_time: string
          tenant_id: string
          updated_at?: string | null
          week_start_date?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          employee_id?: string
          end_time?: string
          id?: string
          start_time?: string
          tenant_id?: string
          updated_at?: string | null
          week_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_working_hours_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_working_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          bank_account_iban: string | null
          bank_account_name: string | null
          city: string | null
          civil_status: string | null
          color: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          contract_type: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_number: string | null
          has_company_car: boolean | null
          has_pension: boolean | null
          hourly_rate: number | null
          hours_per_week: number | null
          id: string
          is_active: boolean | null
          lease_amount: number | null
          monthly_salary: number | null
          name: string
          nationality: string | null
          notice_period_weeks: number | null
          payment_frequency: string | null
          pension_percentage: number | null
          phone: string | null
          postal_code: string | null
          probation_end_date: string | null
          role: Database["public"]["Enums"]["user_role_type"]
          tenant_id: string
          unlock_code: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          bank_account_iban?: string | null
          bank_account_name?: string | null
          city?: string | null
          civil_status?: string | null
          color?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_type?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_number?: string | null
          has_company_car?: boolean | null
          has_pension?: boolean | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          is_active?: boolean | null
          lease_amount?: number | null
          monthly_salary?: number | null
          name: string
          nationality?: string | null
          notice_period_weeks?: number | null
          payment_frequency?: string | null
          pension_percentage?: number | null
          phone?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          role?: Database["public"]["Enums"]["user_role_type"]
          tenant_id: string
          unlock_code?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          bank_account_iban?: string | null
          bank_account_name?: string | null
          city?: string | null
          civil_status?: string | null
          color?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_type?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_number?: string | null
          has_company_car?: boolean | null
          has_pension?: boolean | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          is_active?: boolean | null
          lease_amount?: number | null
          monthly_salary?: number | null
          name?: string
          nationality?: string | null
          notice_period_weeks?: number | null
          payment_frequency?: string | null
          pension_percentage?: number | null
          phone?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          role?: Database["public"]["Enums"]["user_role_type"]
          tenant_id?: string
          unlock_code?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string
          error_message: string
          id: string
          session_id: string | null
          stack_trace: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_message: string
          id?: string
          session_id?: string | null
          stack_trace?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_message?: string
          id?: string
          session_id?: string | null
          stack_trace?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string | null
          id: string
          metadata: Json | null
          recipient_id: string | null
          recipient_phone: string | null
          recipient_type: string
          related_appointment_id: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          title: string
          type: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type: string
          related_appointment_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          title: string
          type: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type?: string
          related_appointment_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_appointment_id_fkey"
            columns: ["related_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_lab_prompts: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          prompt_text: string
          tags: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          prompt_text?: string
          tags?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          prompt_text?: string
          tags?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_lab_prompts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_lab_session_history: {
        Row: {
          created_at: string
          ended_at: number
          id: string
          prompt_text: string | null
          session_id: string
          stats: Json
          tenant_id: string
          transcript: Json
        }
        Insert: {
          created_at?: string
          ended_at: number
          id?: string
          prompt_text?: string | null
          session_id: string
          stats?: Json
          tenant_id: string
          transcript?: Json
        }
        Update: {
          created_at?: string
          ended_at?: number
          id?: string
          prompt_text?: string | null
          session_id?: string
          stats?: Json
          tenant_id?: string
          transcript?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prompt_lab_session_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_features: {
        Row: {
          created_at: string | null
          enabled: boolean
          feature_key: string
          id: string
          role: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          feature_key: string
          id?: string
          role: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          feature_key?: string
          id?: string
          role?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_minutes: number | null
          categories: string[] | null
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          buffer_minutes?: number | null
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          buffer_minutes?: number | null
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          call_control_id: string | null
          created_at: string
          event: string
          id: string
          level: string
          message: string
          metadata: Json | null
          session_id: string | null
          source: string
          tenant_id: string | null
        }
        Insert: {
          call_control_id?: string | null
          created_at?: string
          event: string
          id?: string
          level: string
          message: string
          metadata?: Json | null
          session_id?: string | null
          source: string
          tenant_id?: string | null
        }
        Update: {
          call_control_id?: string | null
          created_at?: string
          event?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          session_id?: string | null
          source?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telnyx_numbers: {
        Row: {
          assigned_at: string | null
          connection_id: string | null
          created_at: string | null
          id: string
          phone_number: string
          released_at: string | null
          status: Database["public"]["Enums"]["telnyx_status_type"] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          connection_id?: string | null
          created_at?: string | null
          id?: string
          phone_number: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["telnyx_status_type"] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          connection_id?: string | null
          created_at?: string | null
          id?: string
          phone_number?: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["telnyx_status_type"] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telnyx_numbers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      temp_reservations: {
        Row: {
          created_at: string | null
          employee_id: string | null
          end_time: string
          expires_at: string
          id: string
          service_id: string | null
          session_id: string
          start_time: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          end_time: string
          expires_at: string
          id?: string
          service_id?: string | null
          session_id: string
          start_time: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          end_time?: string
          expires_at?: string
          id?: string
          service_id?: string | null
          session_id?: string
          start_time?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "temp_reservations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temp_reservations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temp_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_billing_stats: {
        Row: {
          created_at: string | null
          current_period_end: string
          current_period_start: string
          id: string
          included_minutes: number | null
          pack_minutes_remaining: number | null
          tenant_id: string
          updated_at: string | null
          used_minutes: number | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          included_minutes?: number | null
          pack_minutes_remaining?: number | null
          tenant_id: string
          updated_at?: string | null
          used_minutes?: number | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          included_minutes?: number | null
          pack_minutes_remaining?: number | null
          tenant_id?: string
          updated_at?: string | null
          used_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_billing_stats_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          ai_appointment_confirmation_style: string | null
          ai_background_noise_enabled: boolean | null
          ai_background_noise_type: string | null
          ai_background_noise_volume: number | null
          ai_custom_closing: string | null
          ai_custom_greeting: string | null
          ai_custom_personality_text: string | null
          ai_customer_recognition_style: string | null
          ai_emergency_protocol: string | null
          ai_error_handling_tone: string | null
          ai_greeting: string | null
          ai_language: string | null
          ai_language_mode: string | null
          ai_max_time_options: number | null
          ai_model: string | null
          ai_name: string | null
          ai_name_gathering_style: string | null
          ai_no_availability_style: string | null
          ai_personality_preset: string | null
          ai_phone_verification_style: string | null
          ai_response_verbosity: string | null
          ai_service_explanation_verbosity: string | null
          ai_silence_timeout_ms: number | null
          ai_time_slot_presentation_style: string | null
          ai_tone: string | null
          ai_vad_threshold: number | null
          ai_voice: string | null
          calendar_end_hour: number | null
          calendar_start_hour: number | null
          calendar_zoom_level: number | null
          created_at: string | null
          custom_instructions: string | null
          handoff_action:
            | Database["public"]["Enums"]["handoff_action_type"]
            | null
          handoff_phone_number: string | null
          holidays: Json | null
          id: string
          kiosk_greeting: string | null
          kiosk_lock_timeout_minutes: number | null
          kiosk_mode_enabled: boolean | null
          kiosk_show_notifications: boolean
          kiosk_show_schedule: boolean
          master_code: string | null
          planning_horizon_weeks: number | null
          routing_end_time: string | null
          routing_start_time: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ai_appointment_confirmation_style?: string | null
          ai_background_noise_enabled?: boolean | null
          ai_background_noise_type?: string | null
          ai_background_noise_volume?: number | null
          ai_custom_closing?: string | null
          ai_custom_greeting?: string | null
          ai_custom_personality_text?: string | null
          ai_customer_recognition_style?: string | null
          ai_emergency_protocol?: string | null
          ai_error_handling_tone?: string | null
          ai_greeting?: string | null
          ai_language?: string | null
          ai_language_mode?: string | null
          ai_max_time_options?: number | null
          ai_model?: string | null
          ai_name?: string | null
          ai_name_gathering_style?: string | null
          ai_no_availability_style?: string | null
          ai_personality_preset?: string | null
          ai_phone_verification_style?: string | null
          ai_response_verbosity?: string | null
          ai_service_explanation_verbosity?: string | null
          ai_silence_timeout_ms?: number | null
          ai_time_slot_presentation_style?: string | null
          ai_tone?: string | null
          ai_vad_threshold?: number | null
          ai_voice?: string | null
          calendar_end_hour?: number | null
          calendar_start_hour?: number | null
          calendar_zoom_level?: number | null
          created_at?: string | null
          custom_instructions?: string | null
          handoff_action?:
            | Database["public"]["Enums"]["handoff_action_type"]
            | null
          handoff_phone_number?: string | null
          holidays?: Json | null
          id?: string
          kiosk_greeting?: string | null
          kiosk_lock_timeout_minutes?: number | null
          kiosk_mode_enabled?: boolean | null
          kiosk_show_notifications?: boolean
          kiosk_show_schedule?: boolean
          master_code?: string | null
          planning_horizon_weeks?: number | null
          routing_end_time?: string | null
          routing_start_time?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ai_appointment_confirmation_style?: string | null
          ai_background_noise_enabled?: boolean | null
          ai_background_noise_type?: string | null
          ai_background_noise_volume?: number | null
          ai_custom_closing?: string | null
          ai_custom_greeting?: string | null
          ai_custom_personality_text?: string | null
          ai_customer_recognition_style?: string | null
          ai_emergency_protocol?: string | null
          ai_error_handling_tone?: string | null
          ai_greeting?: string | null
          ai_language?: string | null
          ai_language_mode?: string | null
          ai_max_time_options?: number | null
          ai_model?: string | null
          ai_name?: string | null
          ai_name_gathering_style?: string | null
          ai_no_availability_style?: string | null
          ai_personality_preset?: string | null
          ai_phone_verification_style?: string | null
          ai_response_verbosity?: string | null
          ai_service_explanation_verbosity?: string | null
          ai_silence_timeout_ms?: number | null
          ai_time_slot_presentation_style?: string | null
          ai_tone?: string | null
          ai_vad_threshold?: number | null
          ai_voice?: string | null
          calendar_end_hour?: number | null
          calendar_start_hour?: number | null
          calendar_zoom_level?: number | null
          created_at?: string | null
          custom_instructions?: string | null
          handoff_action?:
            | Database["public"]["Enums"]["handoff_action_type"]
            | null
          handoff_phone_number?: string | null
          holidays?: Json | null
          id?: string
          kiosk_greeting?: string | null
          kiosk_lock_timeout_minutes?: number | null
          kiosk_mode_enabled?: boolean | null
          kiosk_show_notifications?: boolean
          kiosk_show_schedule?: boolean
          master_code?: string | null
          planning_horizon_weeks?: number | null
          routing_end_time?: string | null
          routing_start_time?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          house_number: string | null
          id: string
          is_active: boolean | null
          kvk_number: string | null
          name: string
          slug: string
          stripe_customer_id: string | null
          subscription_tier: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string | null
          zipcode: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          house_number?: string | null
          id?: string
          is_active?: boolean | null
          kvk_number?: string | null
          name: string
          slug: string
          stripe_customer_id?: string | null
          subscription_tier?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string | null
          zipcode?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          house_number?: string | null
          id?: string
          is_active?: boolean | null
          kvk_number?: string | null
          name?: string
          slug?: string
          stripe_customer_id?: string | null
          subscription_tier?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string | null
          zipcode?: string | null
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          ip_address: string | null
          metadata: Json | null
          referring_url: string | null
          session_end: string | null
          session_id: string
          session_start: string
          source_channel: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          ip_address?: string | null
          metadata?: Json | null
          referring_url?: string | null
          session_end?: string | null
          session_id: string
          session_start?: string
          source_channel?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          ip_address?: string | null
          metadata?: Json | null
          referring_url?: string | null
          session_end?: string | null
          session_id?: string
          session_start?: string
          source_channel?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          first_name: string | null
          id: string
          last_name: string | null
          marketing_consent: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role_type"] | null
          tenant_id: string
          terms_accepted: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          marketing_consent?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role_type"] | null
          tenant_id: string
          terms_accepted?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          marketing_consent?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role_type"] | null
          tenant_id?: string
          terms_accepted?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_pack_minutes: {
        Args: { p_minutes: number; p_tenant_id: string }
        Returns: undefined
      }
      book_appointment_atomic:
        | {
            Args: {
              p_customer_id: string
              p_employee_id: string
              p_end_time: string
              p_service_id: string
              p_session_id?: string
              p_source?: string
              p_start_time: string
              p_tenant_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_customer_id: string
              p_employee_id: string
              p_end_time: string
              p_service_id: string
              p_source?: Database["public"]["Enums"]["appointment_source_type"]
              p_start_time: string
              p_tenant_id: string
            }
            Returns: string
          }
      create_tenant_and_user:
        | {
            Args: {
              p_address: string
              p_city: string
              p_first_name: string
              p_house_number: string
              p_kvk_number: string
              p_last_name: string
              p_marketing_consent?: boolean
              p_phone: string
              p_tenant_name: string
              p_tenant_slug: string
              p_terms_accepted?: boolean
              p_timezone?: string
              p_zipcode: string
            }
            Returns: string
          }
        | {
            Args: {
              p_first_name: string
              p_last_name: string
              p_tenant_name: string
              p_tenant_slug: string
              p_timezone?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_first_name: string
              p_last_name: string
              p_marketing_consent?: boolean
              p_tenant_name: string
              p_tenant_slug: string
              p_terms_accepted?: boolean
              p_timezone?: string
            }
            Returns: string
          }
      get_auth_tenant_id: { Args: never; Returns: string }
      get_available_slots: {
        Args: {
          p_date: string
          p_employee_id?: string
          p_service_id: string
          p_tenant_id: string
        }
        Returns: {
          employee_id: string
          employee_name: string
          slot_end: string
          slot_start: string
        }[]
      }
      get_employee_services: {
        Args: { p_employee_id?: string; p_tenant_id: string }
        Returns: {
          duration_minutes: number
          employee_id: string
          employee_name: string
          price: number
          service_id: string
          service_name: string
        }[]
      }
      get_employee_working_days: {
        Args: { p_employee_id?: string; p_tenant_id: string }
        Returns: {
          day_name: string
          day_of_week: number
          employee_id: string
          employee_name: string
          end_time: string
          start_time: string
        }[]
      }
      get_employees: {
        Args: { p_employee_id?: string; p_tenant_id: string }
        Returns: {
          color: string
          id: string
          is_active: boolean
          name: string
          phone: string
        }[]
      }
      process_expired_trials: { Args: never; Returns: number }
      set_tenant_context: { Args: { p_tenant_id: string }; Returns: undefined }
    }
    Enums: {
      appointment_source_type: "AI_VOICE" | "WEB" | "MANUAL" | "WIDGET"
      appointment_status_type:
        | "PENDING"
        | "CONFIRMED"
        | "CANCELLED"
        | "NO_SHOW"
        | "COMPLETED"
      call_status_type: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED"
      contract_type_enum:
        | "full_time"
        | "part_time"
        | "flex"
        | "intern"
        | "contractor"
      handoff_action_type: "CALL_BACK" | "FORWARD_CALL"
      step_type_enum:
        | "USER_SPEECH"
        | "AI_SPEECH"
        | "TOOL_CALL"
        | "TOOL_RESULT"
        | "SYSTEM_ERROR"
        | "SESSION_INIT"
        | "CONTEXT_UPDATE"
        | "AI_METADATA"
        | "TOOL_CHAIN_INFO"
      suggestion_status_type: "PENDING" | "APPLIED" | "REJECTED" | "IGNORED"
      suggestion_type_enum: "SYSTEM_PROMPT_TWEAK" | "NEW_KNOWLEDGE" | "TOOL_FIX"
      telnyx_status_type: "AVAILABLE" | "ASSIGNED" | "PENDING_RELEASE"
      user_role_type: "OWNER" | "ADMIN" | "MANAGER" | "STAFF"
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
      appointment_source_type: ["AI_VOICE", "WEB", "MANUAL", "WIDGET"],
      appointment_status_type: [
        "PENDING",
        "CONFIRMED",
        "CANCELLED",
        "NO_SHOW",
        "COMPLETED",
      ],
      call_status_type: ["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"],
      contract_type_enum: [
        "full_time",
        "part_time",
        "flex",
        "intern",
        "contractor",
      ],
      handoff_action_type: ["CALL_BACK", "FORWARD_CALL"],
      step_type_enum: [
        "USER_SPEECH",
        "AI_SPEECH",
        "TOOL_CALL",
        "TOOL_RESULT",
        "SYSTEM_ERROR",
        "SESSION_INIT",
        "CONTEXT_UPDATE",
        "AI_METADATA",
        "TOOL_CHAIN_INFO",
      ],
      suggestion_status_type: ["PENDING", "APPLIED", "REJECTED", "IGNORED"],
      suggestion_type_enum: [
        "SYSTEM_PROMPT_TWEAK",
        "NEW_KNOWLEDGE",
        "TOOL_FIX",
      ],
      telnyx_status_type: ["AVAILABLE", "ASSIGNED", "PENDING_RELEASE"],
      user_role_type: ["OWNER", "ADMIN", "MANAGER", "STAFF"],
    },
  },
} as const

