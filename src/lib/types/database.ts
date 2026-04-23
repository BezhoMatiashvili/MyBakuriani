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
          guest_id: string;
          guest_message: string | null;
          guests_count: number;
          id: string;
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
          subject: string | null;
        };
        Insert: {
          audience_filter: string;
          body: string;
          channel: string;
          id?: string;
          recipient_count?: number;
          sent_at?: string;
          sent_by?: string | null;
          subject?: string | null;
        };
        Update: {
          audience_filter?: string;
          body?: string;
          channel?: string;
          id?: string;
          recipient_count?: number;
          sent_at?: string;
          sent_by?: string | null;
          subject?: string | null;
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
          property_id: string;
          status: Database["public"]["Enums"]["calendar_status"];
        };
        Insert: {
          booking_id?: string | null;
          date: string;
          id?: string;
          property_id: string;
          status?: Database["public"]["Enums"]["calendar_status"];
        };
        Update: {
          booking_id?: string | null;
          date?: string;
          id?: string;
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
      cleaning_tasks: {
        Row: {
          cleaner_id: string | null;
          cleaning_type: string;
          created_at: string | null;
          id: string;
          notes: string | null;
          owner_id: string;
          price: number | null;
          property_id: string;
          scheduled_at: string;
          status: string | null;
        };
        Insert: {
          cleaner_id?: string | null;
          cleaning_type: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          owner_id: string;
          price?: number | null;
          property_id: string;
          scheduled_at: string;
          status?: string | null;
        };
        Update: {
          cleaner_id?: string | null;
          cleaning_type?: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          price?: number | null;
          property_id?: string;
          scheduled_at?: string;
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
      leads: {
        Row: {
          budget_max: number | null;
          budget_min: number | null;
          client_name: string;
          client_phone: string | null;
          created_at: string;
          currency: string;
          id: string;
          next_action_at: string | null;
          note: string | null;
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
          id?: string;
          next_action_at?: string | null;
          note?: string | null;
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
          id?: string;
          next_action_at?: string | null;
          note?: string | null;
          owner_id?: string;
          priority?: Database["public"]["Enums"]["lead_priority"];
          property_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"] | null;
          stage?: Database["public"]["Enums"]["lead_stage"];
          updated_at?: string;
        };
        Relationships: [
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
      notifications: {
        Row: {
          action_url: string | null;
          created_at: string | null;
          id: string;
          is_read: boolean | null;
          message: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          action_url?: string | null;
          created_at?: string | null;
          id?: string;
          is_read?: boolean | null;
          message?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          action_url?: string | null;
          created_at?: string | null;
          id?: string;
          is_read?: boolean | null;
          message?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_packages: {
        Row: {
          amount_gel: number;
          category: string;
          code: string;
          id: string;
          is_enabled: boolean;
          label: string | null;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          amount_gel: number;
          category: string;
          code: string;
          id?: string;
          is_enabled?: boolean;
          label?: string | null;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          amount_gel?: number;
          category?: string;
          code?: string;
          id?: string;
          is_enabled?: boolean;
          label?: string | null;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          admin_notes: string | null;
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          display_name: string;
          id: string;
          is_verified: boolean | null;
          phone: string;
          rating: number | null;
          response_time_minutes: number | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string | null;
          verified_at: string | null;
        };
        Insert: {
          admin_notes?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name: string;
          id: string;
          is_verified?: boolean | null;
          phone: string;
          rating?: number | null;
          response_time_minutes?: number | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string | null;
          verified_at?: string | null;
        };
        Update: {
          admin_notes?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name?: string;
          id?: string;
          is_verified?: boolean | null;
          phone?: string;
          rating?: number | null;
          response_time_minutes?: number | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string | null;
          verified_at?: string | null;
        };
        Relationships: [];
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
          amenities: Json | null;
          area_sqm: number | null;
          bathrooms: number | null;
          cadastral_code: string | null;
          capacity: number | null;
          completion_year: number | null;
          construction_status: string | null;
          created_at: string | null;
          currency: string | null;
          description: string | null;
          developer: string | null;
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
          owner_id: string;
          photos: string[] | null;
          price_per_night: number | null;
          progress_note: string | null;
          progress_note_updated_at: string | null;
          renovation_status: string | null;
          roi_percent: number | null;
          room_type: string | null;
          rooms: number | null;
          sale_price: number | null;
          status: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["property_type"];
          updated_at: string | null;
          views_count: number | null;
          vip_expires_at: string | null;
        };
        Insert: {
          amenities?: Json | null;
          area_sqm?: number | null;
          bathrooms?: number | null;
          cadastral_code?: string | null;
          capacity?: number | null;
          completion_year?: number | null;
          construction_status?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          developer?: string | null;
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
          owner_id: string;
          photos?: string[] | null;
          price_per_night?: number | null;
          progress_note?: string | null;
          progress_note_updated_at?: string | null;
          renovation_status?: string | null;
          roi_percent?: number | null;
          room_type?: string | null;
          rooms?: number | null;
          sale_price?: number | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["property_type"];
          updated_at?: string | null;
          views_count?: number | null;
          vip_expires_at?: string | null;
        };
        Update: {
          amenities?: Json | null;
          area_sqm?: number | null;
          bathrooms?: number | null;
          cadastral_code?: string | null;
          capacity?: number | null;
          completion_year?: number | null;
          construction_status?: string | null;
          created_at?: string | null;
          currency?: string | null;
          description?: string | null;
          developer?: string | null;
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
          owner_id?: string;
          photos?: string[] | null;
          price_per_night?: number | null;
          progress_note?: string | null;
          progress_note_updated_at?: string | null;
          renovation_status?: string | null;
          roi_percent?: number | null;
          room_type?: string | null;
          rooms?: number | null;
          sale_price?: number | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title?: string;
          type?: Database["public"]["Enums"]["property_type"];
          updated_at?: string | null;
          views_count?: number | null;
          vip_expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey";
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
          guest_id: string;
          id?: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_notes?: string | null;
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
          guest_id?: string;
          id?: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_notes?: string | null;
          property_id?: string;
          rating?: number;
          status?: string;
        };
        Relationships: [
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
          category: Database["public"]["Enums"]["service_category"];
          created_at: string | null;
          cuisine_type: string | null;
          currency: string | null;
          description: string | null;
          discount_percent: number | null;
          driver_name: string | null;
          employment_schedule: string | null;
          experience_required: string | null;
          has_delivery: boolean | null;
          id: string;
          is_vip: boolean | null;
          location: string | null;
          menu: Json | null;
          operating_hours: string | null;
          owner_id: string;
          phone: string | null;
          photos: string[] | null;
          position: string | null;
          price: number | null;
          price_unit: string | null;
          route: string | null;
          salary_range: string | null;
          schedule: string | null;
          status: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          updated_at: string | null;
          vehicle_capacity: number | null;
          views_count: number | null;
        };
        Insert: {
          category: Database["public"]["Enums"]["service_category"];
          created_at?: string | null;
          cuisine_type?: string | null;
          currency?: string | null;
          description?: string | null;
          discount_percent?: number | null;
          driver_name?: string | null;
          employment_schedule?: string | null;
          experience_required?: string | null;
          has_delivery?: boolean | null;
          id?: string;
          is_vip?: boolean | null;
          location?: string | null;
          menu?: Json | null;
          operating_hours?: string | null;
          owner_id: string;
          phone?: string | null;
          photos?: string[] | null;
          position?: string | null;
          price?: number | null;
          price_unit?: string | null;
          route?: string | null;
          salary_range?: string | null;
          schedule?: string | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title: string;
          updated_at?: string | null;
          vehicle_capacity?: number | null;
          views_count?: number | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["service_category"];
          created_at?: string | null;
          cuisine_type?: string | null;
          currency?: string | null;
          description?: string | null;
          discount_percent?: number | null;
          driver_name?: string | null;
          employment_schedule?: string | null;
          experience_required?: string | null;
          has_delivery?: boolean | null;
          id?: string;
          is_vip?: boolean | null;
          location?: string | null;
          menu?: Json | null;
          operating_hours?: string | null;
          owner_id?: string;
          phone?: string | null;
          photos?: string[] | null;
          position?: string | null;
          price?: number | null;
          price_unit?: string | null;
          route?: string | null;
          salary_range?: string | null;
          schedule?: string | null;
          status?: Database["public"]["Enums"]["listing_status"] | null;
          title?: string;
          updated_at?: string | null;
          vehicle_capacity?: number | null;
          views_count?: number | null;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_booking: {
        Args: {
          p_check_in: string;
          p_check_out: string;
          p_guest_id: string;
          p_guest_message?: string;
          p_guests_count?: number;
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
      increment_views: { Args: { prop_id: string }; Returns: undefined };
      is_admin_user: { Args: never; Returns: boolean };
      purchase_vip: {
        Args: {
          p_days?: number;
          p_property_id?: string;
          p_purchase_type: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      release_booking_calendar: {
        Args: { p_booking_id: string };
        Returns: number;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      topup_balance: {
        Args: { p_amount: number; p_description?: string; p_user_id: string };
        Returns: number;
      };
    };
    Enums: {
      booking_status: "pending" | "confirmed" | "cancelled" | "completed";
      calendar_status: "available" | "booked" | "blocked";
      lead_priority: "low" | "medium" | "high";
      lead_source:
        | "smart_match"
        | "direct"
        | "call"
        | "walk_in"
        | "referral"
        | "other";
      lead_stage: "new" | "contacted" | "shown" | "negotiating" | "closed";
      listing_status: "active" | "blocked" | "pending" | "draft";
      property_type: "apartment" | "cottage" | "hotel" | "studio" | "villa";
      service_category:
        | "transport"
        | "cleaning"
        | "food"
        | "entertainment"
        | "employment"
        | "handyman";
      transaction_type:
        | "topup"
        | "vip_boost"
        | "super_vip"
        | "sms_package"
        | "discount_badge"
        | "withdrawal"
        | "commission";
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      property_type: ["apartment", "cottage", "hotel", "studio", "villa"],
      service_category: [
        "transport",
        "cleaning",
        "food",
        "entertainment",
        "employment",
        "handyman",
      ],
      transaction_type: [
        "topup",
        "vip_boost",
        "super_vip",
        "sms_package",
        "discount_badge",
        "withdrawal",
        "commission",
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
