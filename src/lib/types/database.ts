export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          phone: string;
          display_name: string;
          avatar_url: string | null;
          role: Database["public"]["Enums"]["user_role"];
          bio: string | null;
          rating: number | null;
          response_time_minutes: number | null;
          is_verified: boolean;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone: string;
          display_name: string;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          bio?: string | null;
          rating?: number | null;
          response_time_minutes?: number | null;
          is_verified?: boolean;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          display_name?: string;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          bio?: string | null;
          rating?: number | null;
          response_time_minutes?: number | null;
          is_verified?: boolean;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          owner_id: string;
          type: Database["public"]["Enums"]["property_type"];
          title: string;
          description: string | null;
          location: string;
          location_lat: number | null;
          location_lng: number | null;
          cadastral_code: string | null;
          area_sqm: number | null;
          rooms: number | null;
          bathrooms: number | null;
          capacity: number | null;
          price_per_night: number | null;
          sale_price: number | null;
          currency: string;
          amenities: Json;
          photos: string[];
          status: Database["public"]["Enums"]["listing_status"];
          is_vip: boolean;
          is_super_vip: boolean;
          vip_expires_at: string | null;
          discount_percent: number;
          views_count: number;
          house_rules: Json;
          min_booking_days: number;
          is_for_sale: boolean;
          roi_percent: number | null;
          construction_status: string | null;
          developer: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          type: Database["public"]["Enums"]["property_type"];
          title: string;
          description?: string | null;
          location: string;
          location_lat?: number | null;
          location_lng?: number | null;
          cadastral_code?: string | null;
          area_sqm?: number | null;
          rooms?: number | null;
          bathrooms?: number | null;
          capacity?: number | null;
          price_per_night?: number | null;
          sale_price?: number | null;
          currency?: string;
          amenities?: Json;
          photos?: string[];
          status?: Database["public"]["Enums"]["listing_status"];
          is_vip?: boolean;
          is_super_vip?: boolean;
          vip_expires_at?: string | null;
          discount_percent?: number;
          views_count?: number;
          house_rules?: Json;
          min_booking_days?: number;
          is_for_sale?: boolean;
          roi_percent?: number | null;
          construction_status?: string | null;
          developer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          type?: Database["public"]["Enums"]["property_type"];
          title?: string;
          description?: string | null;
          location?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          cadastral_code?: string | null;
          area_sqm?: number | null;
          rooms?: number | null;
          bathrooms?: number | null;
          capacity?: number | null;
          price_per_night?: number | null;
          sale_price?: number | null;
          currency?: string;
          amenities?: Json;
          photos?: string[];
          status?: Database["public"]["Enums"]["listing_status"];
          is_vip?: boolean;
          is_super_vip?: boolean;
          vip_expires_at?: string | null;
          discount_percent?: number;
          views_count?: number;
          house_rules?: Json;
          min_booking_days?: number;
          is_for_sale?: boolean;
          roi_percent?: number | null;
          construction_status?: string | null;
          developer?: string | null;
          created_at?: string;
          updated_at?: string;
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
      calendar_blocks: {
        Row: {
          id: string;
          property_id: string;
          date: string;
          status: Database["public"]["Enums"]["calendar_status"];
          booking_id: string | null;
        };
        Insert: {
          id?: string;
          property_id: string;
          date: string;
          status?: Database["public"]["Enums"]["calendar_status"];
          booking_id?: string | null;
        };
        Update: {
          id?: string;
          property_id?: string;
          date?: string;
          status?: Database["public"]["Enums"]["calendar_status"];
          booking_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_blocks_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_blocks_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          property_id: string;
          guest_id: string;
          owner_id: string;
          check_in: string;
          check_out: string;
          guests_count: number;
          status: Database["public"]["Enums"]["booking_status"];
          total_price: number;
          currency: string;
          guest_message: string | null;
          owner_response: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          guest_id: string;
          owner_id: string;
          check_in: string;
          check_out: string;
          guests_count?: number;
          status?: Database["public"]["Enums"]["booking_status"];
          total_price: number;
          currency?: string;
          guest_message?: string | null;
          owner_response?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          guest_id?: string;
          owner_id?: string;
          check_in?: string;
          check_out?: string;
          guests_count?: number;
          status?: Database["public"]["Enums"]["booking_status"];
          total_price?: number;
          currency?: string;
          guest_message?: string | null;
          owner_response?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
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
        ];
      };
      reviews: {
        Row: {
          id: string;
          property_id: string;
          booking_id: string | null;
          guest_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          booking_id?: string | null;
          guest_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          booking_id?: string | null;
          guest_id?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
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
        ];
      };
      services: {
        Row: {
          id: string;
          owner_id: string;
          category: Database["public"]["Enums"]["service_category"];
          title: string;
          description: string | null;
          price: number | null;
          price_unit: string | null;
          currency: string;
          photos: string[];
          location: string | null;
          schedule: string | null;
          phone: string | null;
          discount_percent: number;
          status: Database["public"]["Enums"]["listing_status"];
          is_vip: boolean;
          views_count: number;
          driver_name: string | null;
          vehicle_capacity: number | null;
          route: string | null;
          cuisine_type: string | null;
          has_delivery: boolean;
          operating_hours: string | null;
          menu: Json | null;
          position: string | null;
          salary_range: string | null;
          experience_required: string | null;
          employment_schedule: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          category: Database["public"]["Enums"]["service_category"];
          title: string;
          description?: string | null;
          price?: number | null;
          price_unit?: string | null;
          currency?: string;
          photos?: string[];
          location?: string | null;
          schedule?: string | null;
          phone?: string | null;
          discount_percent?: number;
          status?: Database["public"]["Enums"]["listing_status"];
          is_vip?: boolean;
          views_count?: number;
          driver_name?: string | null;
          vehicle_capacity?: number | null;
          route?: string | null;
          cuisine_type?: string | null;
          has_delivery?: boolean;
          operating_hours?: string | null;
          menu?: Json | null;
          position?: string | null;
          salary_range?: string | null;
          experience_required?: string | null;
          employment_schedule?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          category?: Database["public"]["Enums"]["service_category"];
          title?: string;
          description?: string | null;
          price?: number | null;
          price_unit?: string | null;
          currency?: string;
          photos?: string[];
          location?: string | null;
          schedule?: string | null;
          phone?: string | null;
          discount_percent?: number;
          status?: Database["public"]["Enums"]["listing_status"];
          is_vip?: boolean;
          views_count?: number;
          driver_name?: string | null;
          vehicle_capacity?: number | null;
          route?: string | null;
          cuisine_type?: string | null;
          has_delivery?: boolean;
          operating_hours?: string | null;
          menu?: Json | null;
          position?: string | null;
          salary_range?: string | null;
          experience_required?: string | null;
          employment_schedule?: string | null;
          created_at?: string;
          updated_at?: string;
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
          id: string;
          guest_id: string;
          check_in: string | null;
          check_out: string | null;
          budget_min: number | null;
          budget_max: number | null;
          guests_count: number | null;
          preferences: Json;
          status: string;
          matched_properties: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          guest_id: string;
          check_in?: string | null;
          check_out?: string | null;
          budget_min?: number | null;
          budget_max?: number | null;
          guests_count?: number | null;
          preferences?: Json;
          status?: string;
          matched_properties?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          guest_id?: string;
          check_in?: string | null;
          check_out?: string | null;
          budget_min?: number | null;
          budget_max?: number | null;
          guests_count?: number | null;
          preferences?: Json;
          status?: string;
          matched_properties?: string[];
          created_at?: string;
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
      balances: {
        Row: {
          user_id: string;
          amount: number;
          sms_remaining: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          amount?: number;
          sms_remaining?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          amount?: number;
          sms_remaining?: number;
          updated_at?: string;
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
      transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: Database["public"]["Enums"]["transaction_type"];
          description: string | null;
          reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: Database["public"]["Enums"]["transaction_type"];
          description?: string | null;
          reference_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          type?: Database["public"]["Enums"]["transaction_type"];
          description?: string | null;
          reference_id?: string | null;
          created_at?: string;
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
      sms_messages: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string;
          property_id: string | null;
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_user_id: string;
          to_user_id: string;
          property_id?: string | null;
          message: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          from_user_id?: string;
          to_user_id?: string;
          property_id?: string | null;
          message?: string;
          is_read?: boolean;
          created_at?: string;
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
            foreignKeyName: "sms_messages_to_user_id_fkey";
            columns: ["to_user_id"];
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
        ];
      };
      verifications: {
        Row: {
          id: string;
          user_id: string;
          property_id: string | null;
          status: Database["public"]["Enums"]["verification_status"];
          documents: Json;
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id?: string | null;
          status?: Database["public"]["Enums"]["verification_status"];
          documents?: Json;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          property_id?: string | null;
          status?: Database["public"]["Enums"]["verification_status"];
          documents?: Json;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
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
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          message: string | null;
          is_read: boolean;
          action_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          message?: string | null;
          is_read?: boolean;
          action_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          message?: string | null;
          is_read?: boolean;
          action_url?: string | null;
          created_at?: string;
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
      blog_posts: {
        Row: {
          id: string;
          title: string;
          slug: string;
          content: string;
          excerpt: string | null;
          image_url: string | null;
          author_id: string | null;
          published: boolean;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          content: string;
          excerpt?: string | null;
          image_url?: string | null;
          author_id?: string | null;
          published?: boolean;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          content?: string;
          excerpt?: string | null;
          image_url?: string | null;
          author_id?: string | null;
          published?: boolean;
          published_at?: string | null;
          created_at?: string;
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
      cleaning_tasks: {
        Row: {
          id: string;
          property_id: string;
          owner_id: string;
          cleaner_id: string | null;
          cleaning_type: string;
          scheduled_at: string;
          price: number | null;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          owner_id: string;
          cleaner_id?: string | null;
          cleaning_type: string;
          scheduled_at: string;
          price?: number | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          owner_id?: string;
          cleaner_id?: string | null;
          cleaning_type?: string;
          scheduled_at?: string;
          price?: number | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cleaning_tasks_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
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
            foreignKeyName: "cleaning_tasks_cleaner_id_fkey";
            columns: ["cleaner_id"];
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
      [_ in never]: never;
    };
    Enums: {
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
      property_type: "apartment" | "cottage" | "hotel" | "studio" | "villa";
      listing_status: "active" | "blocked" | "pending" | "draft";
      booking_status: "pending" | "confirmed" | "cancelled" | "completed";
      verification_status: "pending" | "approved" | "rejected";
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
      calendar_status: "available" | "booked" | "blocked";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Convenience type helpers
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
