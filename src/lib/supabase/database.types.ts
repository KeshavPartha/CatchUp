// Supabase Database Types
// This file will be auto-generated when you set up Supabase
// For now, we'll define basic types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          // Added by supabase/migrations/001_social_friend_graph.sql.
          // Nullable so rows created before that migration remain valid.
          username: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      my_list: {
        Row: {
          id: string;
          user_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_id?: number;
          media_type?: 'movie' | 'tv';
          created_at?: string;
        };
        Relationships: [];
      };
      liked_items: {
        Row: {
          id: string;
          user_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_id?: number;
          media_type?: 'movie' | 'tv';
          created_at?: string;
        };
        Relationships: [];
      };
      watch_progress: {
        Row: {
          id: string;
          user_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          progress: number;
          last_watched: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          progress: number;
          last_watched?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_id?: number;
          media_type?: 'movie' | 'tv';
          progress?: number;
          last_watched?: string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------------
      // Social / Realtime workstream
      // Added by supabase/migrations/001_social_friend_graph.sql
      // ----------------------------------------------------------------
      friendships: {
        // Canonical symmetric edge: exactly one row per friendship, always
        // stored with user_a_id < user_b_id. There is no Insert/Update path
        // from the client -- friendships has no INSERT or UPDATE policy, and
        // accept_friend_request() is the only writer.
        Row: {
          user_a_id: string;
          user_b_id: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'friendships_user_a_id_fkey';
            columns: ['user_a_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_user_b_id_fkey';
            columns: ['user_b_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      friend_requests: {
        Row: {
          id: string;
          sender_id: string;
          recipient_id: string;
          status: Database['public']['Enums']['friend_request_status'];
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          sender_id: string;
          recipient_id: string;
          status?: Database['public']['Enums']['friend_request_status'];
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          status?: Database['public']['Enums']['friend_request_status'];
          responded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'friend_requests_sender_id_fkey';
            columns: ['sender_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friend_requests_recipient_id_fkey';
            columns: ['recipient_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      recommendations: {
        Row: {
          id: string;
          sender_id: string;
          recipient_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          note: string | null;
          status: Database['public']['Enums']['recommendation_status'];
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          sender_id: string;
          recipient_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          note?: string | null;
          status?: Database['public']['Enums']['recommendation_status'];
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          status?: Database['public']['Enums']['recommendation_status'];
          responded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recommendations_sender_id_fkey';
            columns: ['sender_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recommendations_recipient_id_fkey';
            columns: ['recipient_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      // --- Social / Realtime workstream -------------------------------
      are_friends: {
        Args: { p_user_a: string; p_user_b: string };
        Returns: boolean;
      };
      send_friend_request: {
        Args: { p_recipient_id: string };
        Returns: string;
      };
      accept_friend_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      decline_friend_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      cancel_friend_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      unfriend: {
        Args: { p_other_user_id: string };
        Returns: undefined;
      };
      list_friends: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          friends_since: string;
        }[];
      };
      list_incoming_friend_requests: {
        Args: Record<string, never>;
        Returns: {
          request_id: string;
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
        }[];
      };
      list_outgoing_friend_requests: {
        Args: Record<string, never>;
        Returns: {
          request_id: string;
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
        }[];
      };
      search_users: {
        Args: { p_query: string };
        Returns: {
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          relationship: string;
          request_id: string | null;
        }[];
      };
      set_username: {
        Args: { p_username: string };
        Returns: undefined;
      };
      recommend_title: {
        Args: {
          p_recipient_id: string;
          p_media_id: number;
          p_media_type: 'movie' | 'tv';
          p_note?: string | null;
        };
        Returns: string;
      };
      set_recommendation_status: {
        Args: { p_id: string; p_status: string };
        Returns: undefined;
      };
      withdraw_recommendation: {
        Args: { p_id: string };
        Returns: undefined;
      };
      list_incoming_recommendations: {
        Args: { p_include_resolved?: boolean };
        Returns: {
          recommendation_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          note: string | null;
          status: string;
          created_at: string;
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
        }[];
      };
      list_outgoing_recommendations: {
        Args: Record<string, never>;
        Returns: {
          recommendation_id: string;
          media_id: number;
          media_type: 'movie' | 'tv';
          note: string | null;
          status: string;
          created_at: string;
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
        }[];
      };
      list_recommendation_targets: {
        Args: { p_media_id: number; p_media_type: 'movie' | 'tv' };
        Returns: {
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          already_sent: boolean;
          recommendation_id: string | null;
        }[];
      };
    };
    Enums: {
      friend_request_status: 'pending' | 'accepted' | 'declined' | 'cancelled';
      recommendation_status: 'pending' | 'seen' | 'dismissed' | 'added';
    };
  };
}

