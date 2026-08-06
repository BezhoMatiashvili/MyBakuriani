export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      ads: {
        Row: {
          banner_url: string | null;
          clicks_count: number;
          created_at: string;
          created_by: string | null;
          end_at: string;
          id: string;
          placement: string;
          position: string;
          start_at: string;
          status: string;
          title: string;
          url: string;
          views_count: number;
        };
        Insert: {
          banner_url?: string | null;
          clicks_count?: number;
          created_at?: string;
          created_by?: string | null;
          end_at: string;
          id?: string;
          placement?: string;
          position: string;
          start_at: string;
          status?: string;
          title: string;
          url: string;
          views_count?: number;
        };
        Update: {
          banner_url?: string | null;
          clicks_count?: number;
          created_at?: string;
          created_by?: string | null;
          end_at?: string;
          id?: string;
          position?: string;
          start_at?: string;
          status?: string;
          title?: string;
          url?: string;
          views_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          actor_id: string | null;
          actor_source: string;
          changed_fields: string[] | null;
          id: string;
          new_values: Json | null;
          occurred_at: string;
          old_values: Json | null;
          operation: string;
          property_id: string | null;
          record_id: string | null;
          service_id: string | null;
          subject_user_id: string | null;
          table_name: string;
        };
        Insert: {
          actor_id?: string | null;
          actor_source?: string;
          changed_fields?: string[] | null;
          id?: string;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          operation: string;
          property_id?: string | null;
          record_id?: string | null;
          service_id?: string | null;
          subject_user_id?: string | null;
          table_name: string;
        };
        Update: {
          actor_id?: string | null;
          actor_source?: string;
          changed_fields?: string[] | null;
          id?: string;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          operation?: string;
          property_id?: string | null;
          record_id?: string | null;
          service_id?: string | null;
          subject_user_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      balances: {
        Row: {
          amount: number | null;
          sms_remaining: number | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          amount?: number | null;
          sms_remaining?: number | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number | null;
          sms_remaining?: number | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "balances_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      blog_posts: {
        Row: {
          author_id: string | null;
          content: string;
          created_at: string | null;
          excerpt: string | null;
          id: string;
          image_url: string | null;
          published: boolean | null;
          published_at: string | null;
          slug: string;
          title: string;
          video_poster_url: string | null;
          video_url: string | null;
        };
        Insert: {
          author_id?: string | null;
          content: string;
          created_at?: string | null;
          excerpt?: string | null;
          id?: string;
          image_url?: string | null;
          published?: boolean | null;
          published_at?: string | null;
          slug: string;
          title: string;
          video_poster_url?: string | null;
          video_url?: string | null;
        };
        Update: {
          author_id?: string | null;
          content?: string;
          created_at?: string | null;
          excerpt?: string | null;
          id?: string;
          image_url?: string | null;
          published?: boolean | null;
          published_at?: string | null;
          slug?: string;
          title?: string;
          video_poster_url?: string | null;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          check_in: string;
          check_out: string;
          created_at: string | null;
          currency: string | null;
          guest_id: string | null;
          guest_name_snapshot: string | null;
          guest_message: string | null;
          guests_count: number;
          id: string;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          owner_id: string;
          owner_response: string | null;
          property_id: string;
          status: Database["public"]["Enums"]["booking_status"] | null;
          total_price: number;
          updated_at: string | null;
        };
        Insert: {
          check_in: string;
          check_out: string;
          created_at?: string | null;
          currency?: string | null;
          guest_id: string;
          guest_message?: string | null;
          guests_count?: number;
          id?: string;
          marketing_consent?: boolean;
          marketing_consent_at?: string | null;
          owner_id: string;
          owner_response?: string | null;
          property_id: string;
          status?: Database["public"]["Enums"]["booking_status"] | null;
          total_price: number;
          updated_at?: string | null;
        };
        Update: {
          check_in?: string;
          check_out?: string;
          created_at?: string | null;
          currency?: string | null;
          guest_id?: string;
          guest_message?: string | null;
          guests_count?: number;
          id?: string;
          marketing_consent?: boolean;
          marketing_consent_at?: string | null;
          owner_id?: string;
          owner_response?: string | null;
          property_id?: string;
          status?: Database["public"]["Enums"]["booking_status"] | null;
          total_price?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcasts: {
        Row: {
          audience_filter: string;
          body: string;
          channel: string;
          id: string;
          recipient_count: number;
          sent_at: string;
          sent_by: string | null;
          severity: string;
          subject: string | null;
          target_roles: string[] | null;
          target_user_ids: string[] | null;
          title: string | null;
        };
        Insert: {
          audience_filter: string;
          body: string;
          channel: string;
          id?: string;
          recipient_count?: number;
          sent_at?: string;
          sent_by?: string | null;
          severity?: string;
          subject?: string | null;
          target_roles?: string[] | null;
          target_user_ids?: string[] | null;
          title?: string | null;
        };
        Update: {
          audience_filter?: string;
          body?: string;
          channel?: string;
          id?: string;
          recipient_count?: number;
          sent_at?: string;
          sent_by?: string | null;
          severity?: string;
          subject?: string | null;
          target_roles?: string[] | null;
          target_user_ids?: string[] | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "broadcasts_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_blocks: {
        Row: {
          booking_id: string | null;
          date: string;
          id: string;
          manual_price: number | null;
          property_id: string;
          status: Database["public"]["Enums"]["calendar_status"];
        };
        Insert: {
          booking_id?: string | null;
          date: string;
          id?: string;
          manual_price?: number | null;
          property_id: string;
          status?: Database["public"]["Enums"]["calendar_status"];
        };
        Update: {
          booking_id?: string | null;
          date?: string;
          id?: string;
          manual_price?: number | null;
          property_id?: string;
          status?: Database["public"]["Enums"]["calendar_status"];
        };
        Relationships: [
          {
            foreignKeyName: "calendar_blocks_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      cleaner_profiles: {
        Row: {
          address: string | null;
          created_at: string;
          first_name: string | null;
          id: string;
          is_online: boolean;
          last_name: string | null;
          personal_number: string | null;
          phone: string | null;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          first_name?: string | null;
          id: string;
          is_online?: boolean;
          last_name?: string | null;
          personal_number?: string | null;
          phone?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          first_name?: string | null;
          id?: string;
          is_online?: boolean;
          last_name?: string | null;
          personal_number?: string | null;
          phone?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cleaner_profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cleaner_manual_tasks: {
        Row: {
          address: string | null;
          cleaner_id: string;
          cleaning_type: string;
          client_name: string;
          client_phone: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          price: number | null;
          scheduled_at: string;
          started_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          cleaner_id: string;
          cleaning_type?: string;
          client_name: string;
          client_phone?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          price?: number | null;
          scheduled_at: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          cleaner_id?: string;
          cleaning_type?: string;
          client_name?: string;
          client_phone?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          price?: number | null;
          scheduled_at?: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cleaner_manual_tasks_cleaner_id_fkey";
            columns: ["cleaner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cleaning_tasks: {
        Row: {
          address: string | null;
          cleaner_id: string | null;
          cleaning_type: string;
          completed_at: string | null;
          created_at: string | null;
          id: string;
          notes: string | null;
          owner_id: string;
          price: number | null;
          property_id: string;
          scheduled_at: string;
          started_at: string | null;
          status: string | null;
        };
        Insert: {
          address?: string | null;
          cleaner_id?: string | null;
          cleaning_type: string;
          completed_at?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          owner_id: string;
          price?: number | null;
          property_id: string;
          scheduled_at: string;
          started_at?: string | null;
          status?: string | null;
        };
        Update: {
          address?: string | null;
          cleaner_id?: string | null;
          cleaning_type?: string;
          completed_at?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          price?: number | null;
          property_id?: string;
          scheduled_at?: string;
          started_at?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cleaning_tasks_cleaner_id_fkey";
            columns: ["cleaner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cleaning_tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cleaning_tasks_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_events: {
        Row: {
          channel: Database["public"]["Enums"]["contact_channel"];
          created_at: string;
          expires_at: string;
          id: string;
          owner_id: string;
          property_id: string | null;
          service_id: string | null;
          sms_sent_count: number;
          visitor_id: string;
          visitor_phone: string | null;
        };
        Insert: {
          channel: Database["public"]["Enums"]["contact_channel"];
          created_at?: string;
          expires_at?: string;
          id?: string;
          owner_id: string;
          property_id?: string | null;
          service_id?: string | null;
          sms_sent_count?: number;
          visitor_id: string;
          visitor_phone?: string | null;
        };
        Update: {
          channel?: Database["public"]["Enums"]["contact_channel"];
          created_at?: string;
          expires_at?: string;
          id?: string;
          owner_id?: string;
          property_id?: string | null;
          service_id?: string | null;
          sms_sent_count?: number;
          visitor_id?: string;
          visitor_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_events_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_events_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_events_visitor_id_fkey";
            columns: ["visitor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          property_id: string | null;
          service_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          property_id?: string | null;
          service_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          property_id?: string | null;
          service_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      job_applications: {
        Row: {
          applicant_user_id: string | null;
          birth_date: string | null;
          created_at: string;
          current_location: string | null;
          cv_path: string | null;
          desired_salary: number | null;
          full_name: string;
          has_experience: boolean;
          has_health_certificate: boolean;
          id: string;
          is_non_smoker: boolean;
          languages: string[];
          last_workplace: string | null;
          needs_housing: boolean;
          phone: string;
          service_id: string;
          status: string;
        };
        Insert: {
          applicant_user_id?: string | null;
          birth_date?: string | null;
          created_at?: string;
          current_location?: string | null;
          cv_path?: string | null;
          desired_salary?: number | null;
          full_name: string;
          has_experience?: boolean;
          has_health_certificate?: boolean;
          id?: string;
          is_non_smoker?: boolean;
          languages?: string[];
          last_workplace?: string | null;
          needs_housing?: boolean;
          phone: string;
          service_id: string;
          status?: string;
        };
        Update: {
          applicant_user_id?: string | null;
          birth_date?: string | null;
          created_at?: string;
          current_location?: string | null;
          cv_path?: string | null;
          desired_salary?: number | null;
          full_name?: string;
          has_experience?: boolean;
          has_health_certificate?: boolean;
          id?: string;
          is_non_smoker?: boolean;
          languages?: string[];
          last_workplace?: string | null;
          needs_housing?: boolean;
          phone?: string;
          service_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_applications_applicant_user_id_fkey";
            columns: ["applicant_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_applications_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      landing_banners: {
        Row: {
          active: boolean;
          body: string | null;
          created_at: string;
          created_by: string | null;
          cta_href: string | null;
          cta_label: string | null;
          end_at: string | null;
          id: string;
          image_url: string | null;
          kind: Database["public"]["Enums"]["landing_banner_kind"];
          placement: string;
          sort_order: number;
          start_at: string | null;
          title: string;
          tone: string;
          updated_at: string;
          video_poster_url: string | null;
          video_url: string | null;
        };
        Insert: {
          active?: boolean;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          cta_href?: string | null;
          cta_label?: string | null;
          end_at?: string | null;
          id?: string;
          image_url?: string | null;
          kind: Database["public"]["Enums"]["landing_banner_kind"];
          placement?: string;
          sort_order?: number;
          start_at?: string | null;
          title: string;
          tone?: string;
          updated_at?: string;
          video_poster_url?: string | null;
          video_url?: string | null;
        };
        Update: {
          active?: boolean;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          cta_href?: string | null;
          cta_label?: string | null;
          end_at?: string | null;
          id?: string;
          image_url?: string | null;
          kind?: Database["public"]["Enums"]["landing_banner_kind"];
          placement?: string;
          sort_order?: number;
          start_at?: string | null;
          title?: string;
          tone?: string;
          updated_at?: string;
          video_poster_url?: string | null;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "landing_banners_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          budget_max: number | null;
          budget_min: number | null;
          client_name: string;
          client_phone: string | null;
          created_at: string;
          currency: string;
          desired_location: string | null;
          id: string;
          interest_type: string | null;
          next_action_at: string | null;
          note: string | null;
          organization_id: string | null;
          owner_id: string;
          priority: Database["public"]["Enums"]["lead_priority"];
          property_id: string | null;
          source: Database["public"]["Enums"]["lead_source"] | null;
          stage: Database["public"]["Enums"]["lead_stage"];
          updated_at: string;
        };
        Insert: {
          budget_max?: number | null;
          budget_min?: number | null;
          client_name: string;
          client_phone?: string | null;
          created_at?: string;
          currency?: string;
          desired_location?: string | null;
          id?: string;
          interest_type?: string | null;
          next_action_at?: string | null;
          note?: string | null;
          organization_id?: string | null;
          owner_id: string;
          priority?: Database["public"]["Enums"]["lead_priority"];
          property_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"] | null;
          stage?: Database["public"]["Enums"]["lead_stage"];
          updated_at?: string;
        };
        Update: {
          budget_max?: number | null;
          budget_min?: number | null;
          client_name?: string;
          client_phone?: string | null;
          created_at?: string;
          currency?: string;
          desired_location?: string | null;
          id?: string;
          interest_type?: string | null;
          next_action_at?: string | null;
          note?: string | null;
          organization_id?: string | null;
          owner_id?: string;
          priority?: Database["public"]["Enums"]["lead_priority"];
          property_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"] | null;
          stage?: Database["public"]["Enums"]["lead_stage"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      manual_booking_sms_consents: {
        Row: {
          accepted_at: string | null;
          consent_version: string;
          created_at: string;
          declined_at: string | null;
          id: string;
          manual_booking_id: string;
          owner_id: string;
          phone_snapshot: string | null;
          revoked_at: string | null;
          status: string;
          token_hash: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          consent_version: string;
          created_at?: string;
          declined_at?: string | null;
          id?: string;
          manual_booking_id: string;
          owner_id: string;
          phone_snapshot?: string | null;
          revoked_at?: string | null;
          status: string;
          token_hash?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          consent_version?: string;
          created_at?: string;
          declined_at?: string | null;
          id?: string;
          manual_booking_id?: string;
          owner_id?: string;
          phone_snapshot?: string | null;
          revoked_at?: string | null;
          status?: string;
          token_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "manual_booking_sms_consents_manual_booking_id_fkey";
            columns: ["manual_booking_id"];
            isOneToOne: false;
            referencedRelation: "manual_bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_booking_sms_consents_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      manual_bookings: {
        Row: {
          amount: number | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          check_in: string;
          check_out: string;
          client_list: string | null;
          created_at: string | null;
          deposit_amount: number | null;
          deposit_paid_on: string | null;
          guest_name: string | null;
          guest_phone: string | null;
          guests_count: number | null;
          id: string;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          note: string | null;
          owner_id: string;
          property_id: string;
          renter_guest_id: string | null;
          source: string | null;
          status: string;
          status_before_cancel: string | null;
        };
        Insert: {
          amount?: number | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          check_in: string;
          check_out: string;
          client_list?: string | null;
          created_at?: string | null;
          deposit_amount?: number | null;
          deposit_paid_on?: string | null;
          guest_name?: string | null;
          guest_phone?: string | null;
          guests_count?: number | null;
          id?: string;
          marketing_consent?: boolean;
          marketing_consent_at?: string | null;
          note?: string | null;
          owner_id: string;
          property_id: string;
          renter_guest_id?: string | null;
          source?: string | null;
          status?: string;
          status_before_cancel?: string | null;
        };
        Update: {
          amount?: number | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          check_in?: string;
          check_out?: string;
          client_list?: string | null;
          created_at?: string | null;
          deposit_amount?: number | null;
          deposit_paid_on?: string | null;
          guest_name?: string | null;
          guest_phone?: string | null;
          guests_count?: number | null;
          id?: string;
          marketing_consent?: boolean;
          marketing_consent_at?: string | null;
          note?: string | null;
          owner_id?: string;
          property_id?: string;
          renter_guest_id?: string | null;
          source?: string | null;
          status?: string;
          status_before_cancel?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "manual_bookings_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_bookings_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_bookings_renter_guest_id_fkey";
            columns: ["renter_guest_id"];
            isOneToOne: false;
            referencedRelation: "renter_guests";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          action_url: string | null;
          broadcast_id: string | null;
          created_at: string | null;
          dashboard_scope: string | null;
          id: string;
          is_read: boolean | null;
          message: string | null;
          severity: string;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          action_url?: string | null;
          broadcast_id?: string | null;
          created_at?: string | null;
          dashboard_scope?: string | null;
          id?: string;
          is_read?: boolean | null;
          message?: string | null;
          severity?: string;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          action_url?: string | null;
          broadcast_id?: string | null;
          created_at?: string | null;
          dashboard_scope?: string | null;
          id?: string;
          is_read?: boolean | null;
          message?: string | null;
          severity?: string;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_broadcast_id_fkey";
            columns: ["broadcast_id"];
            isOneToOne: false;
            referencedRelation: "broadcasts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_admin_notes: {
        Row: {
          notes: string | null;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          notes?: string | null;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          notes?: string | null;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_admin_notes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          role: string;
          status: string;
          user_id: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_subscriptions: {
        Row: {
          amount_gel: number;
          created_at: string;
          expires_at: string;
          id: string;
          listing_limit: number | null;
          organization_id: string;
          starts_at: string;
          status: string;
          tier: string;
        };
        Insert: {
          amount_gel: number;
          created_at?: string;
          expires_at: string;
          id?: string;
          listing_limit?: number | null;
          organization_id: string;
          starts_at?: string;
          status?: string;
          tier: string;
        };
        Update: {
          amount_gel?: number;
          created_at?: string;
          expires_at?: string;
          id?: string;
          listing_limit?: number | null;
          organization_id?: string;
          starts_at?: string;
          status?: string;
          tier?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          address: string | null;
          brand_name: string;
          city: string | null;
          company_type: string;
          cover_url: string | null;
          created_at: string;
          id: string;
          identification_code: string;
          legal_name: string;
          location_lat: number | null;
          location_lng: number | null;
          logo_url: string | null;
          org_type: string;
          owner_id: string;
          phone: string | null;
          status: string;
          updated_at: string;
          verified_at: string | null;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          brand_name: string;
          city?: string | null;
          company_type: string;
          cover_url?: string | null;
          created_at?: string;
          id?: string;
          identification_code: string;
          legal_name: string;
          location_lat?: number | null;
          location_lng?: number | null;
          logo_url?: string | null;
          org_type: string;
          owner_id: string;
          phone?: string | null;
          status?: string;
          updated_at?: string;
          verified_at?: string | null;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          brand_name?: string;
          city?: string | null;
          company_type?: string;
          cover_url?: string | null;
          created_at?: string;
          id?: string;
          identification_code?: string;
          legal_name?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          logo_url?: string | null;
          org_type?: string;
          owner_id?: string;
          phone?: string | null;
          status?: string;
          updated_at?: string;
          verified_at?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      page_views: {
        Row: {
          created_at: string;
          id: string;
          path: string | null;
          user_id: string | null;
          visitor_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          path?: string | null;
          user_id?: string | null;
          visitor_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          path?: string | null;
          user_id?: string | null;
          visitor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "page_views_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          card_brand: string | null;
          card_last4: string | null;
          completed_at: string | null;
          created_at: string;
          currency: string;
          id: string;
          last_error: string | null;
          metadata: Json | null;
          purpose: string;
          reference_id: string | null;
          return_path: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          card_brand?: string | null;
          card_last4?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          last_error?: string | null;
          metadata?: Json | null;
          purpose?: string;
          reference_id?: string | null;
          return_path?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          card_brand?: string | null;
          card_last4?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          last_error?: string | null;
          metadata?: Json | null;
          purpose?: string;
          reference_id?: string | null;
          return_path?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      price_overrides: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          price: number;
          property_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: string;
          price: number;
          property_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          price?: number;
          property_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_overrides_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_packages: {
        Row: {
          amount_gel: number;
          category: string;
          code: string;
          description: string | null;
          id: string;
          is_enabled: boolean;
          label: string | null;
          meta: Json;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          amount_gel: number;
          category: string;
          code: string;
          description?: string | null;
          id?: string;
          is_enabled?: boolean;
          label?: string | null;
          meta?: Json;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          amount_gel?: number;
          category?: string;
          code?: string;
          description?: string | null;
          id?: string;
          is_enabled?: boolean;
          label?: string | null;
          meta?: Json;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile_admin_notes: {
        Row: {
          notes: string | null;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          notes?: string | null;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          notes?: string | null;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_admin_notes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          display_name: string;
          id: string;
          is_verified: boolean | null;
          marketing_opt_out: boolean;
          notification_prefs: Json | null;
          personal_id: string | null;
          phone: string | null;
          profile_type: string | null;
          rating: number | null;
          response_time_minutes: number | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string | null;
          verified_at: string | null;
          whatsapp_enabled: boolean | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name: string;
          id: string;
          is_verified?: boolean | null;
          marketing_opt_out?: boolean;
          notification_prefs?: Json | null;
          personal_id?: string | null;
          phone?: string | null;
          profile_type?: string | null;
          rating?: number | null;
          response_time_minutes?: number | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string | null;
          verified_at?: string | null;
          whatsapp_enabled?: boolean | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name?: string;
          id?: string;
          is_verified?: boolean | null;
          marketing_opt_out?: boolean;
          notification_prefs?: Json | null;
          personal_id?: string | null;
          phone?: string | null;
          profile_type?: string | null;
          rating?: number | null;
          response_time_minutes?: number | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string | null;
          verified_at?: string | null;
          whatsapp_enabled?: boolean | null;
        };
        Relationships: [];
      };
      project_updates: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          owner_id: string;
          photos: string[];
          property_id: string;
          status: string | null;
          update_date: string;
          video_url: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          owner_id: string;
          photos?: string[];
          property_id: string;
          status?: string | null;
          update_date?: string;
          video_url?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          owner_id?: string;
          photos?: string[];
          property_id?: string;
          status?: string | null;
          update_date?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_updates_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_updates_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      promocodes: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          discount_type: string;
          discount_value: number;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          uses_count: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          discount_type: string;
          discount_value: number;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          uses_count?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          discount_type?: string;
          discount_value?: number;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          uses_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "promocodes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      properties: {
        Row: {
          admin_notes: string | null;
          amenities: Json | null;
          area_sqm: number | null;
          bathrooms: number | null;
          cadastral_code: string | null;
          capacity: number | null;
          check_in_time: string;
          cleaning_fee: number | null;
          completion_year: number | null;
          construction_image_url: string | null;
          construction_progress_percent: number | null;
          construction_stages: string[];
          construction_status: string | null;
          created_at: string | null;
          currency: string | null;
          description: string | null;
          developer: string | null;
          discount_expires_at: string | null;
          discount_percent: number | null;
          distance_to_slope_m: number | null;
          hotel_stars: number | null;
          house_rules: Json | null;
          id: string;
          is_b2b_partner: boolean | null;
          is_for_sale: boolean | null;
          is_super_vip: boolean | null;
          is_vip: boolean | null;
          location: string;
          location_lat: number | null;
          location_lng: number | null;
          min_booking_days: number | null;
          numeric_rating: number | null;
          organization_id: string | null;
          owner_id: string;
          phone: string | null;
          photos: string[] | null;
          price_per_night: number | null;
          progress_note: string | null;
          progress_note_updated_at: string | null;
          registration_readiness: string | null;
          renovation_status: string | null;
          roi_percent: number | null;
          roi_percent_max: number | null;
          room_type: string | null;
          rooms: number | null;
          sale_price: number | null;
          status: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["property_type"];
          units_reserved: number;
          units_sold: number;
          units_total: number | null;
          updated_at: string | null;
          views_count: number | null;
          vip_expires_at: string | null;
          vip_expiry_notified_at: string | null;
          whatsapp: string | null;
        };
        Insert: {
          admin_notes?: string | null;
          amenities?: Json | null;
          area_sqm?: number | null;
          bathrooms?: number | null;
          cadastral_code?: string | null;
          capacity?: number | null;
          check_in_time?: string;
          cleaning_fee?: number | null;
          completion_year?: number | null;
          construction_image_url?: string | null;
          construction_progress_percent?: number | null;
          construction_stages?: string[];
          construction_status?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          developer?: string | null;
          discount_expires_at?: string | null;
          discount_percent?: number | null;
          distance_to_slope_m?: number | null;
          hotel_stars?: number | null;
          house_rules?: Json | null;
          id?: string;
          is_b2b_partner?: boolean | null;
          is_for_sale?: boolean | null;
          is_super_vip?: boolean | null;
          is_vip?: boolean | null;
          location: string;
          location_lat?: number | null;
          location_lng?: number | null;
          min_booking_days?: number | null;
          numeric_rating?: number | null;
          organization_id?: string | null;
          owner_id: string;
          phone?: string | null;
          photos?: string[] | null;
          price_per_night?: number | null;
          progress_note?: string | null;
          progress_note_updated_at?: string | null;
          registration_readiness?: string | null;
          renovation_status?: string | null;
          roi_percent?: number | null;
          roi_percent_max?: number | null;
          room_type?: string | null;
          rooms?: number | null;
          sale_price?: number | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["property_type"];
          units_reserved?: number;
          units_sold?: number;
          units_total?: number | null;
          updated_at?: string | null;
          views_count?: number | null;
          vip_expires_at?: string | null;
          vip_expiry_notified_at?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          admin_notes?: string | null;
          amenities?: Json | null;
          area_sqm?: number | null;
          bathrooms?: number | null;
          cadastral_code?: string | null;
          capacity?: number | null;
          check_in_time?: string;
          cleaning_fee?: number | null;
          completion_year?: number | null;
          construction_image_url?: string | null;
          construction_progress_percent?: number | null;
          construction_stages?: string[];
          construction_status?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          developer?: string | null;
          discount_expires_at?: string | null;
          discount_percent?: number | null;
          distance_to_slope_m?: number | null;
          hotel_stars?: number | null;
          house_rules?: Json | null;
          id?: string;
          is_b2b_partner?: boolean | null;
          is_for_sale?: boolean | null;
          is_super_vip?: boolean | null;
          is_vip?: boolean | null;
          location?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          min_booking_days?: number | null;
          numeric_rating?: number | null;
          organization_id?: string | null;
          owner_id?: string;
          phone?: string | null;
          photos?: string[] | null;
          price_per_night?: number | null;
          progress_note?: string | null;
          progress_note_updated_at?: string | null;
          registration_readiness?: string | null;
          renovation_status?: string | null;
          roi_percent?: number | null;
          roi_percent_max?: number | null;
          room_type?: string | null;
          rooms?: number | null;
          sale_price?: number | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title?: string;
          type?: Database["public"]["Enums"]["property_type"];
          units_reserved?: number;
          units_sold?: number;
          units_total?: number | null;
          updated_at?: string | null;
          views_count?: number | null;
          vip_expires_at?: string | null;
          vip_expiry_notified_at?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "properties_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      properties_photos_backup: {
        Row: {
          backed_up_at: string | null;
          id: string | null;
          photos: string[] | null;
        };
        Insert: {
          backed_up_at?: string | null;
          id?: string | null;
          photos?: string[] | null;
        };
        Update: {
          backed_up_at?: string | null;
          id?: string | null;
          photos?: string[] | null;
        };
        Relationships: [];
      };
      renter_cleaners: {
        Row: {
          available: boolean;
          created_at: string | null;
          description: string | null;
          experience_years: number | null;
          id: string;
          languages: string[] | null;
          location: string | null;
          name: string;
          owner_id: string;
          phone: string | null;
          price_general: number | null;
          price_standard: number | null;
          schedule: string | null;
          updated_at: string | null;
        };
        Insert: {
          available?: boolean;
          created_at?: string | null;
          description?: string | null;
          experience_years?: number | null;
          id?: string;
          languages?: string[] | null;
          location?: string | null;
          name: string;
          owner_id: string;
          phone?: string | null;
          price_general?: number | null;
          price_standard?: number | null;
          schedule?: string | null;
          updated_at?: string | null;
        };
        Update: {
          available?: boolean;
          created_at?: string | null;
          description?: string | null;
          experience_years?: number | null;
          id?: string;
          languages?: string[] | null;
          location?: string | null;
          name?: string;
          owner_id?: string;
          phone?: string | null;
          price_general?: number | null;
          price_standard?: number | null;
          schedule?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "renter_cleaners_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      renter_guests: {
        Row: {
          blacklisted: boolean;
          created_at: string | null;
          id: string;
          name: string;
          note: string | null;
          owner_id: string;
          phone: string | null;
          profile_id: string | null;
          updated_at: string | null;
          visit_dates: string | null;
        };
        Insert: {
          blacklisted?: boolean;
          created_at?: string | null;
          id?: string;
          name: string;
          note?: string | null;
          owner_id: string;
          phone?: string | null;
          profile_id?: string | null;
          updated_at?: string | null;
          visit_dates?: string | null;
        };
        Update: {
          blacklisted?: boolean;
          created_at?: string | null;
          id?: string;
          name?: string;
          note?: string | null;
          owner_id?: string;
          phone?: string | null;
          profile_id?: string | null;
          updated_at?: string | null;
          visit_dates?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "renter_guests_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "renter_guests_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      renter_saved_cleaners: {
        Row: {
          cleaner_id: string;
          created_at: string;
          owner_id: string;
        };
        Insert: {
          cleaner_id: string;
          created_at?: string;
          owner_id: string;
        };
        Update: {
          cleaner_id?: string;
          created_at?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "renter_saved_cleaners_cleaner_id_fkey";
            columns: ["cleaner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "renter_saved_cleaners_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          ai_analyzed_at: string | null;
          ai_risk_tags: Json;
          ai_sentiment: string | null;
          booking_id: string | null;
          comment: string | null;
          created_at: string | null;
          guest_id: string;
          id: string;
          moderated_at: string | null;
          moderated_by: string | null;
          moderation_notes: string | null;
          manual_booking_id: string | null;
          property_id: string;
          rating: number;
          status: string;
        };
        Insert: {
          ai_analyzed_at?: string | null;
          ai_risk_tags?: Json;
          ai_sentiment?: string | null;
          booking_id?: string | null;
          comment?: string | null;
          created_at?: string | null;
          guest_id?: string | null;
          guest_name_snapshot?: string | null;
          id?: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_notes?: string | null;
          manual_booking_id?: string | null;
          property_id: string;
          rating: number;
          status?: string;
        };
        Update: {
          ai_analyzed_at?: string | null;
          ai_risk_tags?: Json;
          ai_sentiment?: string | null;
          booking_id?: string | null;
          comment?: string | null;
          created_at?: string | null;
          guest_id?: string | null;
          guest_name_snapshot?: string | null;
          id?: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_notes?: string | null;
          manual_booking_id?: string | null;
          property_id?: string;
          rating?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_manual_booking_id_fkey";
            columns: ["manual_booking_id"];
            isOneToOne: false;
            referencedRelation: "manual_bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey";
            columns: ["moderated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          accommodation: string | null;
          activity_category: string | null;
          activity_type: string | null;
          admin_notes: string | null;
          age_min: string | null;
          avg_check: string | null;
          category: Database["public"]["Enums"]["service_category"];
          coords: Json | null;
          created_at: string | null;
          cuisine_type: string | null;
          currency: string | null;
          description: string | null;
          discount_expires_at: string | null;
          discount_percent: number | null;
          driver_name: string | null;
          duration: string | null;
          employment_schedule: string | null;
          employment_type: string | null;
          equipment: string[] | null;
          experience_required: string | null;
          features: string[] | null;
          good_for: string | null;
          has_delivery: boolean | null;
          has_kids_area: boolean;
          has_live_music: boolean;
          has_lounge: boolean;
          id: string;
          is_new: boolean;
          is_super_vip: boolean | null;
          is_vip: boolean | null;
          languages: string[] | null;
          location: string | null;
          meals: string | null;
          menu: Json | null;
          menu_url: string | null;
          menu_views_count: number;
          operating_hours: string | null;
          owner_id: string;
          phone: string | null;
          photos: string[] | null;
          position: string | null;
          price: number | null;
          price_unit: string | null;
          provider_name: string | null;
          rating: number | null;
          requirements: string | null;
          restaurant_type: string | null;
          reviews_count: number | null;
          route: string | null;
          route_pricing: Json | null;
          routes: string[] | null;
          safety_notes: string | null;
          salary_daily: number | null;
          salary_max: number | null;
          salary_min: number | null;
          salary_range: string | null;
          salary_type: string | null;
          schedule: string | null;
          service_field: string | null;
          status: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          transport_type: string | null;
          updated_at: string | null;
          vehicle_capacity: number | null;
          vehicle_color: string | null;
          vehicle_make: string | null;
          views_count: number | null;
          vip_expires_at: string | null;
          vip_expiry_notified_at: string | null;
          whatsapp: string | null;
          work_schedule: string | null;
        };
        Insert: {
          accommodation?: string | null;
          activity_category?: string | null;
          activity_type?: string | null;
          admin_notes?: string | null;
          age_min?: string | null;
          avg_check?: string | null;
          category: Database["public"]["Enums"]["service_category"];
          coords?: Json | null;
          created_at?: string | null;
          cuisine_type?: string | null;
          currency?: string | null;
          description?: string | null;
          discount_expires_at?: string | null;
          discount_percent?: number | null;
          driver_name?: string | null;
          duration?: string | null;
          employment_schedule?: string | null;
          employment_type?: string | null;
          equipment?: string[] | null;
          experience_required?: string | null;
          features?: string[] | null;
          good_for?: string | null;
          has_delivery?: boolean | null;
          has_kids_area?: boolean;
          has_live_music?: boolean;
          has_lounge?: boolean;
          id?: string;
          is_new?: boolean;
          is_super_vip?: boolean | null;
          is_vip?: boolean | null;
          languages?: string[] | null;
          location?: string | null;
          meals?: string | null;
          menu?: Json | null;
          menu_url?: string | null;
          menu_views_count?: number;
          operating_hours?: string | null;
          owner_id: string;
          phone?: string | null;
          photos?: string[] | null;
          position?: string | null;
          price?: number | null;
          price_unit?: string | null;
          provider_name?: string | null;
          rating?: number | null;
          requirements?: string | null;
          restaurant_type?: string | null;
          reviews_count?: number | null;
          route?: string | null;
          route_pricing?: Json | null;
          routes?: string[] | null;
          safety_notes?: string | null;
          salary_daily?: number | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_range?: string | null;
          salary_type?: string | null;
          schedule?: string | null;
          service_field?: string | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          transport_type?: string | null;
          updated_at?: string | null;
          vehicle_capacity?: number | null;
          vehicle_color?: string | null;
          vehicle_make?: string | null;
          views_count?: number | null;
          vip_expires_at?: string | null;
          vip_expiry_notified_at?: string | null;
          whatsapp?: string | null;
          work_schedule?: string | null;
        };
        Update: {
          accommodation?: string | null;
          activity_category?: string | null;
          activity_type?: string | null;
          admin_notes?: string | null;
          age_min?: string | null;
          avg_check?: string | null;
          category?: Database["public"]["Enums"]["service_category"];
          coords?: Json | null;
          created_at?: string | null;
          cuisine_type?: string | null;
          currency?: string | null;
          description?: string | null;
          discount_expires_at?: string | null;
          discount_percent?: number | null;
          driver_name?: string | null;
          duration?: string | null;
          employment_schedule?: string | null;
          employment_type?: string | null;
          equipment?: string[] | null;
          experience_required?: string | null;
          features?: string[] | null;
          good_for?: string | null;
          has_delivery?: boolean | null;
          has_kids_area?: boolean;
          has_live_music?: boolean;
          has_lounge?: boolean;
          id?: string;
          is_new?: boolean;
          is_super_vip?: boolean | null;
          is_vip?: boolean | null;
          languages?: string[] | null;
          location?: string | null;
          meals?: string | null;
          menu?: Json | null;
          menu_url?: string | null;
          menu_views_count?: number;
          operating_hours?: string | null;
          owner_id?: string;
          phone?: string | null;
          photos?: string[] | null;
          position?: string | null;
          price?: number | null;
          price_unit?: string | null;
          provider_name?: string | null;
          rating?: number | null;
          requirements?: string | null;
          restaurant_type?: string | null;
          reviews_count?: number | null;
          route?: string | null;
          route_pricing?: Json | null;
          routes?: string[] | null;
          safety_notes?: string | null;
          salary_daily?: number | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_range?: string | null;
          salary_type?: string | null;
          schedule?: string | null;
          service_field?: string | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title?: string;
          transport_type?: string | null;
          updated_at?: string | null;
          vehicle_capacity?: number | null;
          vehicle_color?: string | null;
          vehicle_make?: string | null;
          views_count?: number | null;
          vip_expires_at?: string | null;
          vip_expiry_notified_at?: string | null;
          whatsapp?: string | null;
          work_schedule?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "services_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      services_photos_backup: {
        Row: {
          backed_up_at: string | null;
          id: string | null;
          photos: string[] | null;
        };
        Insert: {
          backed_up_at?: string | null;
          id?: string | null;
          photos?: string[] | null;
        };
        Update: {
          backed_up_at?: string | null;
          id?: string | null;
          photos?: string[] | null;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      smart_match_offers: {
        Row: {
          created_at: string;
          guest_seen: boolean;
          id: string;
          offered_price: number;
          property_id: string;
          renter_id: string;
          request_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          guest_seen?: boolean;
          id?: string;
          offered_price: number;
          property_id: string;
          renter_id: string;
          request_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          guest_seen?: boolean;
          id?: string;
          offered_price?: number;
          property_id?: string;
          renter_id?: string;
          request_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "smart_match_offers_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "smart_match_offers_renter_id_fkey";
            columns: ["renter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "smart_match_offers_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "smart_match_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      smart_match_requests: {
        Row: {
          budget_max: number | null;
          budget_min: number | null;
          check_in: string | null;
          check_out: string | null;
          created_at: string | null;
          guest_id: string;
          guests_count: number | null;
          id: string;
          matched_properties: string[] | null;
          preferences: Json | null;
          status: string | null;
          zone: string | null;
        };
        Insert: {
          budget_max?: number | null;
          budget_min?: number | null;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string | null;
          guest_id: string;
          guests_count?: number | null;
          id?: string;
          matched_properties?: string[] | null;
          preferences?: Json | null;
          status?: string | null;
          zone?: string | null;
        };
        Update: {
          budget_max?: number | null;
          budget_min?: number | null;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string | null;
          guest_id?: string;
          guests_count?: number | null;
          id?: string;
          matched_properties?: string[] | null;
          preferences?: Json | null;
          status?: string | null;
          zone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "smart_match_requests_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_automation_rules: {
        Row: {
          check_in_reminder_enabled: boolean;
          check_in_reminder_hours_before: number;
          created_at: string;
          review_request_enabled: boolean;
          review_request_hours_after: number;
          updated_at: string;
          user_id: string;
          win_back_days_after: number;
          win_back_discount_period: string | null;
          win_back_discount_value: string | null;
          win_back_enabled: boolean;
        };
        Insert: {
          check_in_reminder_enabled?: boolean;
          check_in_reminder_hours_before?: number;
          created_at?: string;
          review_request_enabled?: boolean;
          review_request_hours_after?: number;
          updated_at?: string;
          user_id: string;
          win_back_days_after?: number;
          win_back_discount_period?: string | null;
          win_back_discount_value?: string | null;
          win_back_enabled?: boolean;
        };
        Update: {
          check_in_reminder_enabled?: boolean;
          check_in_reminder_hours_before?: number;
          created_at?: string;
          review_request_enabled?: boolean;
          review_request_hours_after?: number;
          updated_at?: string;
          user_id?: string;
          win_back_days_after?: number;
          win_back_discount_period?: string | null;
          win_back_discount_value?: string | null;
          win_back_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "sms_automation_rules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_price_alert_rules: {
        Row: {
          property_id: string;
          owner_id: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          property_id: string;
          owner_id: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          property_id?: string;
          owner_id?: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_price_alert_rules_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: true;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_price_alert_rules_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_price_alert_subscriptions: {
        Row: {
          property_id: string;
          subscriber_id: string;
          active: boolean;
          consent_version: string;
          subscribed_at: string;
          unsubscribed_at: string | null;
          updated_at: string;
        };
        Insert: {
          property_id: string;
          subscriber_id: string;
          active?: boolean;
          consent_version?: string;
          subscribed_at?: string;
          unsubscribed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          property_id?: string;
          subscriber_id?: string;
          active?: boolean;
          consent_version?: string;
          subscribed_at?: string;
          unsubscribed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_price_alert_subscriptions_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_price_alert_subscriptions_subscriber_id_fkey";
            columns: ["subscriber_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_price_drop_events: {
        Row: {
          id: string;
          property_id: string;
          payer_id: string;
          baseline_price: number;
          latest_price: number;
          lowest_price: number;
          property_title: string;
          currency: string | null;
          window_started_at: string;
          last_decrease_at: string;
          send_after: string;
          status: string;
          outcome_reason: string | null;
          materialized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          payer_id: string;
          baseline_price: number;
          latest_price: number;
          lowest_price: number;
          property_title: string;
          currency?: string | null;
          window_started_at?: string;
          last_decrease_at?: string;
          send_after: string;
          status?: string;
          outcome_reason?: string | null;
          materialized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          payer_id?: string;
          baseline_price?: number;
          latest_price?: number;
          lowest_price?: number;
          property_title?: string;
          currency?: string | null;
          window_started_at?: string;
          last_decrease_at?: string;
          send_after?: string;
          status?: string;
          outcome_reason?: string | null;
          materialized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_price_drop_events_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_price_drop_events_payer_id_fkey";
            columns: ["payer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_broadcasts: {
        Row: {
          admin_notes: string | null;
          audience: Database["public"]["Enums"]["sms_broadcast_audience"];
          audience_snapshot: Json;
          created_at: string;
          id: string;
          message: string;
          recipient_count: number;
          reviewed_at: string | null;
          reviewed_by: string | null;
          sender_id: string;
          status: Database["public"]["Enums"]["sms_broadcast_status"];
        };
        Insert: {
          admin_notes?: string | null;
          audience: Database["public"]["Enums"]["sms_broadcast_audience"];
          audience_snapshot?: Json;
          created_at?: string;
          id?: string;
          message: string;
          recipient_count?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sender_id: string;
          status?: Database["public"]["Enums"]["sms_broadcast_status"];
        };
        Update: {
          admin_notes?: string | null;
          audience?: Database["public"]["Enums"]["sms_broadcast_audience"];
          audience_snapshot?: Json;
          created_at?: string;
          id?: string;
          message?: string;
          recipient_count?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sender_id?: string;
          status?: Database["public"]["Enums"]["sms_broadcast_status"];
        };
        Relationships: [
          {
            foreignKeyName: "sms_broadcasts_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_broadcasts_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_messages: {
        Row: {
          created_at: string | null;
          from_user_id: string;
          id: string;
          is_read: boolean | null;
          message: string;
          property_id: string | null;
          to_user_id: string;
        };
        Insert: {
          created_at?: string | null;
          from_user_id: string;
          id?: string;
          is_read?: boolean | null;
          message: string;
          property_id?: string | null;
          to_user_id: string;
        };
        Update: {
          created_at?: string | null;
          from_user_id?: string;
          id?: string;
          is_read?: boolean | null;
          message?: string;
          property_id?: string | null;
          to_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sms_messages_from_user_id_fkey";
            columns: ["from_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_messages_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_messages_to_user_id_fkey";
            columns: ["to_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_outbound: {
        Row: {
          admin_notes: string | null;
          automation_kind: string | null;
          available_at: string;
          broadcast_id: string | null;
          charged_at: string | null;
          contact_event_id: string | null;
          created_at: string;
          dispatch_attempt_count: number;
          dispatch_claim_token: string | null;
          dispatch_claimed_at: string | null;
          id: string;
          delivered_at: string | null;
          expires_at: string | null;
          legacy_origin: boolean;
          message: string;
          provider_response: Json | null;
          provider_message_id: string | null;
          price_drop_event_id: string | null;
          recipient_id: string | null;
          recipient_phone: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          sender_id: string;
          sent_at: string | null;
          source_booking_id: string | null;
          source_manual_booking_id: string | null;
          submitted_at: string | null;
          status: Database["public"]["Enums"]["sms_outbound_status"];
        };
        Insert: {
          admin_notes?: string | null;
          automation_kind?: string | null;
          available_at?: string;
          broadcast_id?: string | null;
          charged_at?: string | null;
          contact_event_id?: string | null;
          created_at?: string;
          dispatch_attempt_count?: number;
          dispatch_claim_token?: string | null;
          dispatch_claimed_at?: string | null;
          id?: string;
          delivered_at?: string | null;
          expires_at?: string | null;
          legacy_origin?: boolean;
          message: string;
          provider_response?: Json | null;
          provider_message_id?: string | null;
          price_drop_event_id?: string | null;
          recipient_id: string | null;
          recipient_phone: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sender_id: string;
          sent_at?: string | null;
          source_booking_id?: string | null;
          source_manual_booking_id?: string | null;
          submitted_at?: string | null;
          status?: Database["public"]["Enums"]["sms_outbound_status"];
        };
        Update: {
          admin_notes?: string | null;
          automation_kind?: string | null;
          available_at?: string;
          broadcast_id?: string | null;
          charged_at?: string | null;
          contact_event_id?: string | null;
          created_at?: string;
          dispatch_attempt_count?: number;
          dispatch_claim_token?: string | null;
          dispatch_claimed_at?: string | null;
          id?: string;
          delivered_at?: string | null;
          expires_at?: string | null;
          legacy_origin?: boolean;
          message?: string;
          provider_response?: Json | null;
          provider_message_id?: string | null;
          price_drop_event_id?: string | null;
          recipient_id?: string | null;
          recipient_phone?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          sender_id?: string;
          sent_at?: string | null;
          source_booking_id?: string | null;
          source_manual_booking_id?: string | null;
          submitted_at?: string | null;
          status?: Database["public"]["Enums"]["sms_outbound_status"];
        };
        Relationships: [
          {
            foreignKeyName: "sms_outbound_price_drop_event_id_fkey";
            columns: ["price_drop_event_id"];
            isOneToOne: false;
            referencedRelation: "sale_price_drop_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_outbound_broadcast_id_fkey";
            columns: ["broadcast_id"];
            isOneToOne: false;
            referencedRelation: "sms_broadcasts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_outbound_contact_event_id_fkey";
            columns: ["contact_event_id"];
            isOneToOne: false;
            referencedRelation: "contact_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_outbound_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_outbound_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_outbound_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_outbound_source_booking_id_fkey";
            columns: ["source_booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount: number;
          created_at: string | null;
          description: string | null;
          id: string;
          reference_id: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          reference_id?: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          reference_id?: string | null;
          type?: Database["public"]["Enums"]["transaction_type"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_subscriptions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          package_id: string | null;
          starts_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          package_id?: string | null;
          starts_at: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          package_id?: string | null;
          starts_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "pricing_packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      verifications: {
        Row: {
          admin_notes: string | null;
          created_at: string | null;
          documents: Json | null;
          id: string;
          property_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["verification_status"] | null;
          user_id: string;
        };
        Insert: {
          admin_notes?: string | null;
          created_at?: string | null;
          documents?: Json | null;
          id?: string;
          property_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["verification_status"] | null;
          user_id: string;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string | null;
          documents?: Json | null;
          id?: string;
          property_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["verification_status"] | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verifications_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      zones: {
        Row: {
          created_at: string;
          description_ka: string;
          icon: string;
          id: string;
          is_active: boolean;
          lat: number;
          lng: number;
          name_ka: string;
          price_per_sqm_override: number | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description_ka?: string;
          icon?: string;
          id?: string;
          is_active?: boolean;
          lat: number;
          lng: number;
          name_ka: string;
          price_per_sqm_override?: number | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_ka?: string;
          icon?: string;
          id?: string;
          is_active?: boolean;
          lat?: number;
          lng?: number;
          name_ka?: string;
          price_per_sqm_override?: number | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      // These are deliberately typed as their legacy listing shapes while the
      // application finishes its staged migration. The SQL views themselves
      // are the security boundary: they expose an allowlist and never contact,
      // owner, moderation, booking, or AI fields. `has_whatsapp` is the only
      // contact-related signal intentionally exposed by the listing views.
      public_properties: {
        Row: Database["public"]["Tables"]["properties"]["Row"] & {
          has_whatsapp: boolean;
        };
        Relationships: [];
      };
      public_services: {
        Row: Database["public"]["Tables"]["services"]["Row"] & {
          has_whatsapp: boolean;
          has_active_discount: boolean;
        };
        Relationships: [];
      };
      public_listing_profiles: {
        Row: Database["public"]["Tables"]["profiles"]["Row"];
        Relationships: [];
      };
      public_organizations: {
        Row: Database["public"]["Tables"]["organizations"]["Row"];
        Relationships: [];
      };
      public_reviews: {
        Row: Database["public"]["Tables"]["reviews"]["Row"];
        Relationships: [];
      };
    };
    Functions: {
      _enqueue_system_sms: {
        Args: { p_kind: string; p_message: string; p_user_id: string };
        Returns: undefined;
      };
      _notify: {
        Args: {
          p_action_url?: string;
          p_message?: string;
          p_title: string;
          p_type: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      admin_clients_with_stats: { Args: never; Returns: Json };
      admin_dashboard_stats: {
        Args: never;
        Returns: {
          active_listings: number;
          active_or_completed_bookings: number;
          average_booking_price: number;
          average_response_minutes: number;
          completed_bookings: number;
          total_bookings: number;
          total_properties: number;
          total_revenue: number;
        }[];
      };
      admin_overview_stats: {
        Args: never;
        Returns: {
          active_listings: number;
          net_revenue: number;
          pending_over_24h: number;
          registered_users: number;
          registered_visitors: number;
          requests_7d: number;
          searches_7d: number;
          total_visits: number;
          unique_visits: number;
          visits_7d: number;
          weekly_visitors: number;
        }[];
      };
      add_renter_guest_to_blacklist: {
        Args: {
          p_name: string;
          p_note?: string;
          p_phone?: string;
        };
        Returns: {
          guest: {
            blacklisted: boolean;
            created_at: string | null;
            id: string;
            name: string;
            note: string | null;
            owner_id: string;
            phone: string | null;
            profile_id: string | null;
            updated_at: string | null;
            visit_dates: string | null;
          };
          was_already_blacklisted: boolean;
        };
      };
      apply_calendar_availability: {
        Args: {
          p_action: string;
          p_dates: string[];
          p_property_id: string;
        };
        Returns: {
          changed_dates: string[];
          skipped_booked_dates: string[];
        }[];
      };
      cancel_manual_booking: {
        Args: { p_id: string };
        Returns: Database["public"]["Tables"]["manual_bookings"]["Row"];
      };
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      create_booking: {
        Args: {
          p_check_in: string;
          p_check_out: string;
          p_guest_id: string;
          p_guest_message?: string;
          p_guests_count?: number;
          p_marketing_consent?: boolean;
          p_property_id: string;
        };
        Returns: {
          check_in: string;
          check_out: string;
          created_at: string | null;
          currency: string | null;
          guest_id: string;
          guest_message: string | null;
          guests_count: number;
          id: string;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          owner_id: string;
          owner_response: string | null;
          property_id: string;
          status: Database["public"]["Enums"]["booking_status"] | null;
          total_price: number;
          updated_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_manual_booking: {
        Args: {
          p_amount?: number | null;
          p_check_in: string;
          p_check_out: string;
          p_client_list?: string;
          p_deposit_amount?: number | null;
          p_deposit_paid_on?: string | null;
          p_guest_name?: string;
          p_guest_phone?: string;
          p_guests_count?: number;
          p_marketing_consent?: boolean;
          p_note?: string;
          p_property_id: string;
          p_renter_guest_id?: string;
          p_source?: string;
          p_status?: string;
        };
        Returns: {
          amount: number | null;
          check_in: string;
          check_out: string;
          client_list: string | null;
          created_at: string | null;
          deposit_amount: number | null;
          deposit_paid_on: string | null;
          guest_name: string | null;
          guest_phone: string | null;
          guests_count: number | null;
          id: string;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          note: string | null;
          owner_id: string;
          property_id: string;
          renter_guest_id: string | null;
          source: string | null;
          status: string;
        };
        SetofOptions: {
          from: "*";
          to: "manual_bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_guest_manual_booking: {
        Args: {
          p_amount?: number | null;
          p_check_in: string;
          p_check_out: string;
          p_deposit_amount?: number | null;
          p_deposit_paid_on?: string | null;
          p_marketing_consent?: boolean;
          p_name: string;
          p_note?: string;
          p_phone?: string;
          p_property_id: string;
        };
        Returns: {
          amount: number | null;
          check_in: string;
          check_out: string;
          client_list: string | null;
          created_at: string | null;
          deposit_amount: number | null;
          deposit_paid_on: string | null;
          guest_name: string | null;
          guest_phone: string | null;
          guests_count: number | null;
          id: string;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          note: string | null;
          owner_id: string;
          property_id: string;
          renter_guest_id: string | null;
          source: string | null;
          status: string;
        };
        SetofOptions: {
          from: "*";
          to: "manual_bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_organization: {
        Args: {
          p_address?: string;
          p_brand_name: string;
          p_city?: string;
          p_company_type: string;
          p_cover_url?: string;
          p_identification_code: string;
          p_lat?: number;
          p_legal_name: string;
          p_lng?: number;
          p_logo_url?: string;
          p_org_type: string;
          p_phone?: string;
          p_website?: string;
        };
        Returns: string;
      };
      dashboard_layout_data: { Args: never; Returns: Json };
      get_cleaner_renter_counts: {
        Args: never;
        Returns: {
          cleaner_id: string;
          renters_served: number;
        }[];
      };
      get_platform_cleaners: {
        Args: never;
        Returns: {
          avatar_url: string;
          cleaner_id: string;
          is_online: boolean;
          location: string;
          name: string;
          photo: string;
          price: number;
          price_unit: string;
          service_id: string;
        }[];
      };
      global_search: {
        Args: { entity_types?: string[]; q: string; result_limit?: number };
        Returns: {
          entity_id: string;
          entity_type: string;
          payload: Json;
          photo: string;
          sim: number;
          slug: string;
          snippet: string;
          title: string;
        }[];
      };
      increment_ad_metric: {
        Args: { p_ad_id: string; p_event: string };
        Returns: undefined;
      };
      increment_service_menu_views: {
        Args: { p_service_id: string };
        Returns: undefined;
      };
      increment_service_views: {
        Args: { p_service_id: string };
        Returns: undefined;
      };
      increment_views: { Args: { prop_id: string }; Returns: undefined };
      is_admin_user: { Args: never; Returns: boolean };
      normalize_ge_phone: { Args: { p: string }; Returns: string };
      owner_dashboard_stats: {
        Args: {
          p_from?: string;
          p_listing_ids?: string[];
          p_organization_id?: string;
          p_scope: string;
          p_to?: string;
        };
        Returns: {
          calls: number;
          favorites_total: number;
          menu_views_total: number;
          revenue: number;
          spent: number;
          views_total: number;
        }[];
      };
      photos_are_storage_urls: { Args: { p: string[] }; Returns: boolean };
      purchase_company_subscription: {
        Args: { p_org_id: string; p_tier: string; p_user_id: string };
        Returns: Json;
      };
      issue_manual_booking_sms_consent: {
        Args: {
          p_consent_version: string;
          p_manual_booking_id: string;
          p_owner_id: string;
          p_phone_snapshot: string;
          p_token_hash: string;
        };
        Returns: Database["public"]["Tables"]["manual_booking_sms_consents"]["Row"];
        SetofOptions: {
          from: "*";
          to: "manual_booking_sms_consents";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      purchase_package: {
        Args: {
          p_discount_percent?: number;
          p_package_id: string;
          p_property_id?: string;
          p_quantity?: number;
          p_service_id?: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      purchase_vip: {
        Args: {
          p_days?: number;
          p_property_id?: string;
          p_purchase_type: string;
          p_service_id?: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      restore_manual_booking: {
        Args: { p_id: string };
        Returns: Database["public"]["Tables"]["manual_bookings"]["Row"];
      };
      respond_manual_booking_sms_consent: {
        Args: { p_action: string; p_token_hash: string };
        Returns: Json;
      };
      record_contact_event: {
        Args: {
          p_channel: string;
          p_owner_id: string;
          p_property_id: string;
          p_service_id: string;
          p_visitor_id: string;
        };
        Returns: string;
      };
      release_booking_calendar: {
        Args: { p_booking_id: string };
        Returns: number;
      };
      request_organization_membership: {
        Args: { p_org_id: string };
        Returns: string;
      };
      respond_membership_request: {
        Args: { p_action: string; p_member_id: string };
        Returns: undefined;
      };
      seller_dashboard_stats: {
        Args: {
          p_from: string;
          p_organization_id?: string;
          p_property_ids?: string[];
          p_to: string;
        };
        Returns: {
          contact_reach: number;
          favorites: number;
          new_interest: number;
          new_leads: number;
          sms_views: number;
          sold: number;
          views_total: number;
        }[];
      };
      settle_payment: {
        Args: {
          p_approved: boolean;
          p_card_brand?: string;
          p_card_last4?: string;
          p_error?: string;
          p_payment_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      smart_match_actionable_count: { Args: never; Returns: number };
      self_service_set_cleaner_working_hours: {
        Args: {
          p_actor_id: string;
          p_is_24_7: boolean;
          p_service_id: string;
          p_working_hours: string;
        };
        Returns: Json;
      };
      sms_audience_count: {
        Args: {
          p_audience: Database["public"]["Enums"]["sms_broadcast_audience"];
          p_sender_id: string;
        };
        Returns: number;
      };
      sms_consume_credit: {
        Args: { p_sender_id: string; p_sms_id: string };
        Returns: undefined;
      };
      sms_consume_credits_bulk: {
        Args: { p_sender_id: string; p_sms_ids: string[] };
        Returns: number;
      };
      sms_cancel_ineligible_automation: { Args: never; Returns: number };
      sms_cancel_ineligible_price_drop: { Args: never; Returns: number };
      manual_review_token_details: {
        Args: { p_token: string };
        Returns: Json;
      };
      submit_manual_booking_review: {
        Args: { p_token: string; p_rating: number; p_comment?: string | null };
        Returns: string;
      };
      sms_cancel_queued_automation: {
        Args: { p_kind: string; p_reason?: string; p_sender_id: string };
        Returns: number;
      };
      sms_canonical_ge_phone: { Args: { p: string }; Returns: string | null };
      sms_claim_dispatch_batch: {
        Args: { p_claim_token: string; p_limit?: number };
        Returns: {
          id: string;
          message: string;
          recipient_phone: string;
        }[];
      };
      sms_dispatch_batch: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          message: string;
          recipient_phone: string;
        }[];
      };
      sms_enqueue_automation: {
        Args: {
          p_booking_id?: string;
          p_kind: string;
          p_manual_booking_id?: string;
          p_message: string;
          p_recipient_id: string | null;
          p_recipient_phone: string;
          p_sender_id: string;
        };
        Returns: string | null;
      };
      sms_expire_stale_automation: { Args: never; Returns: number };
      sms_patch_automation_rules: {
        Args: { p_sender_id: string; p_patch: Json };
        Returns: Database["public"]["Tables"]["sms_automation_rules"]["Row"];
      };
      sms_set_price_drop_rule: {
        Args: { p_owner_id: string; p_property_id: string; p_enabled: boolean };
        Returns: Database["public"]["Tables"]["sale_price_alert_rules"]["Row"];
      };
      sms_materialize_due_price_drop_events: {
        Args: {
          p_site_url: string;
          p_limit?: number;
          p_allowed_payers?: string[] | null;
        };
        Returns: Json;
      };
      sms_create_manual_review_token: {
        Args: { p_owner_id: string; p_manual_booking_id: string };
        Returns: string;
      };
      sms_mark_claim_submitted: {
        Args: {
          p_sms_id: string;
          p_claim_token: string;
          p_provider_message_id: string;
          p_provider_response?: Json;
        };
        Returns: undefined;
      };
      sms_mark_provider_delivered: {
        Args: { p_provider_message_id: string; p_provider_response?: Json };
        Returns: Json;
      };
      sms_mark_failed: {
        Args: { p_provider_response?: Json; p_sms_id: string };
        Returns: undefined;
      };
      sms_mark_sent: {
        Args: { p_provider_response?: Json; p_sms_id: string };
        Returns: Json;
      };
      sms_mark_claim_failed: {
        Args: {
          p_claim_token: string;
          p_provider_response?: Json;
          p_sms_id: string;
        };
        Returns: undefined;
      };
      sms_mark_claim_sent: {
        Args: {
          p_claim_token: string;
          p_provider_response?: Json;
          p_sms_id: string;
        };
        Returns: Json;
      };
      sms_release_dispatch_claim: {
        Args: { p_claim_token: string; p_sms_id: string };
        Returns: undefined;
      };
      sms_set_automation_rules: {
        Args: {
          p_check_in_enabled: boolean;
          p_discount_period: string | null;
          p_discount_value: string | null;
          p_review_enabled: boolean;
          p_sender_id: string;
          p_win_back_enabled: boolean;
        };
        Returns: Database["public"]["Tables"]["sms_automation_rules"]["Row"];
      };
      sms_send_broadcast: {
        Args: {
          p_audience: Database["public"]["Enums"]["sms_broadcast_audience"];
          p_message: string;
          p_sender_id: string;
        };
        Returns: Json;
      };
      topup_balance: {
        Args: {
          p_amount: number;
          p_dashboard_scope?: string;
          p_description?: string;
          p_user_id: string;
        };
        Returns: number;
      };
      update_manual_booking: {
        Args: {
          p_amount?: number | null;
          p_check_in: string;
          p_check_out: string;
          p_client_list?: string;
          p_deposit_amount?: number | null;
          p_deposit_paid_on?: string | null;
          p_guest_name?: string;
          p_guest_phone?: string;
          p_guests_count?: number;
          p_id: string;
          p_marketing_consent?: boolean;
          p_note?: string;
          p_renter_guest_id?: string;
          p_source?: string;
          p_status?: string;
        };
        Returns: {
          amount: number | null;
          check_in: string;
          check_out: string;
          client_list: string | null;
          created_at: string | null;
          deposit_amount: number | null;
          deposit_paid_on: string | null;
          guest_name: string | null;
          guest_phone: string | null;
          guests_count: number | null;
          id: string;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          note: string | null;
          owner_id: string;
          property_id: string;
          renter_guest_id: string | null;
          source: string | null;
          status: string;
        };
        SetofOptions: {
          from: "*";
          to: "manual_bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      booking_status: "pending" | "confirmed" | "cancelled" | "completed";
      calendar_status: "available" | "booked" | "blocked";
      contact_channel: "call" | "whatsapp";
      landing_banner_kind: "info" | "promo" | "sticky_news";
      lead_priority: "low" | "medium" | "high";
      lead_source:
        "smart_match" | "direct" | "call" | "walk_in" | "referral" | "other";
      lead_stage: "new" | "contacted" | "shown" | "negotiating" | "closed";
      listing_status: "active" | "blocked" | "pending" | "draft";
      property_type:
        "apartment" | "cottage" | "hotel" | "studio" | "villa" | "land";
      service_category:
        | "transport"
        | "cleaning"
        | "food"
        | "entertainment"
        | "employment"
        | "handyman";
      sms_broadcast_audience:
        | "renter_past_guests"
        | "renter_upcoming_guests"
        | "renter_all_contacts"
        | "food_recent_customers"
        | "food_all_contacts"
        | "service_recent_clients"
        | "service_all_contacts"
        | "seller_active_leads"
        | "seller_new_leads";
      sms_broadcast_status:
        | "pending"
        | "partial_approved"
        | "approved"
        | "rejected"
        | "sent"
        | "failed";
      sms_outbound_status:
        "pending" | "approved" | "submitted" | "rejected" | "sent" | "failed";
      transaction_type:
        | "topup"
        | "vip_boost"
        | "super_vip"
        | "sms_package"
        | "discount_badge"
        | "withdrawal"
        | "commission"
        | "sms_send";
      user_role:
        | "guest"
        | "renter"
        | "seller"
        | "cleaner"
        | "food"
        | "entertainment"
        | "transport"
        | "employment"
        | "handyman"
        | "admin";
      verification_status: "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      booking_status: ["pending", "confirmed", "cancelled", "completed"],
      calendar_status: ["available", "booked", "blocked"],
      contact_channel: ["call", "whatsapp"],
      landing_banner_kind: ["info", "promo", "sticky_news"],
      lead_priority: ["low", "medium", "high"],
      lead_source: [
        "smart_match",
        "direct",
        "call",
        "walk_in",
        "referral",
        "other",
      ],
      lead_stage: ["new", "contacted", "shown", "negotiating", "closed"],
      listing_status: ["active", "blocked", "pending", "draft"],
      property_type: [
        "apartment",
        "cottage",
        "hotel",
        "studio",
        "villa",
        "land",
      ],
      service_category: [
        "transport",
        "cleaning",
        "food",
        "entertainment",
        "employment",
        "handyman",
      ],
      sms_broadcast_audience: [
        "renter_past_guests",
        "renter_upcoming_guests",
        "renter_all_contacts",
        "food_recent_customers",
        "food_all_contacts",
        "service_recent_clients",
        "service_all_contacts",
        "seller_active_leads",
        "seller_new_leads",
      ],
      sms_broadcast_status: [
        "pending",
        "partial_approved",
        "approved",
        "rejected",
        "sent",
        "failed",
      ],
      sms_outbound_status: [
        "pending",
        "approved",
        "submitted",
        "rejected",
        "sent",
        "failed",
      ],
      transaction_type: [
        "topup",
        "vip_boost",
        "super_vip",
        "sms_package",
        "discount_badge",
        "withdrawal",
        "commission",
        "sms_send",
      ],
      user_role: [
        "guest",
        "renter",
        "seller",
        "cleaner",
        "food",
        "entertainment",
        "transport",
        "employment",
        "handyman",
        "admin",
      ],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const;
