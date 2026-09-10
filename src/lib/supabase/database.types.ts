export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MediaType = 'movie' | 'tv';

export interface Database {
  public: {
    Tables: {
      profiles: {
        // `username` added by supabase/migrations/20260911_social_layer.sql (social layer).
        Row: { id: string; email: string; full_name: string | null; avatar_url: string | null; username: string | null; created_at: string; updated_at: string };
        Insert: { id: string; email: string; full_name?: string | null; avatar_url?: string | null; username?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; email?: string; full_name?: string | null; avatar_url?: string | null; username?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      my_list: {
        Row: { id: string; user_id: string; media_id: number; media_type: MediaType; created_at: string };
        Insert: { id?: string; user_id: string; media_id: number; media_type: MediaType; created_at?: string };
        Update: { id?: string; user_id?: string; media_id?: number; media_type?: MediaType; created_at?: string };
        Relationships: [];
      };
      liked_items: {
        Row: { id: string; user_id: string; media_id: number; media_type: MediaType; created_at: string };
        Insert: { id?: string; user_id: string; media_id: number; media_type: MediaType; created_at?: string };
        Update: { id?: string; user_id?: string; media_id?: number; media_type?: MediaType; created_at?: string };
        Relationships: [];
      };
      watch_progress: {
        Row: {
          id: string;
          user_id: string;
          media_type: MediaType;
          media_id: number | null;
          show_id: string | null;
          season_id: string | null;
          episode_id: string | null;
          current_season_number: number | null;
          current_episode_number: number | null;
          position_seconds: number;
          duration_seconds: number;
          progress_percent: number;
          completed: boolean;
          last_watched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          media_type: MediaType;
          media_id?: number | null;
          show_id?: string | null;
          season_id?: string | null;
          episode_id?: string | null;
          current_season_number?: number | null;
          current_episode_number?: number | null;
          position_seconds?: number;
          duration_seconds?: number;
          progress_percent?: number;
          completed?: boolean;
          last_watched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_type?: MediaType;
          media_id?: number | null;
          show_id?: string | null;
          season_id?: string | null;
          episode_id?: string | null;
          current_season_number?: number | null;
          current_episode_number?: number | null;
          position_seconds?: number;
          duration_seconds?: number;
          progress_percent?: number;
          completed?: boolean;
          last_watched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      episode_plot_events: {
        Row: {
          id: string;
          show_id: string | null;
          season_id: string | null;
          season_number: number | null;
          episode_id: string;
          episode_number: number | null;
          event_order: number;
          event_text: string | null;
          involved_characters: string[];
          importance_score: number | null;
          tags: string[];
          title: string | null;
          summary: string | null;
          spoiler_boundary: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          show_id?: string | null;
          season_id?: string | null;
          season_number?: number | null;
          episode_id: string;
          episode_number?: number | null;
          event_order: number;
          event_text?: string | null;
          involved_characters?: string[];
          importance_score?: number | null;
          tags?: string[];
          title?: string | null;
          summary?: string | null;
          spoiler_boundary?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          show_id?: string | null;
          season_id?: string | null;
          season_number?: number | null;
          episode_id?: string;
          episode_number?: number | null;
          event_order?: number;
          event_text?: string | null;
          involved_characters?: string[];
          importance_score?: number | null;
          tags?: string[];
          title?: string | null;
          summary?: string | null;
          spoiler_boundary?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: { id: string; requester_id: string; addressee_id: string; status: 'pending' | 'accepted' | 'declined' | 'blocked'; created_at: string; updated_at: string };
        Insert: { id?: string; requester_id: string; addressee_id: string; status?: 'pending' | 'accepted' | 'declined' | 'blocked'; created_at?: string; updated_at?: string };
        Update: { id?: string; requester_id?: string; addressee_id?: string; status?: 'pending' | 'accepted' | 'declined' | 'blocked'; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      show_recommendations: {
        Row: { id: string; sender_id: string; recipient_id: string; media_id: number; media_type: MediaType; note: string | null; status: 'unread' | 'read' | 'dismissed'; created_at: string; read_at: string | null };
        Insert: { id?: string; sender_id: string; recipient_id: string; media_id: number; media_type: MediaType; note?: string | null; status?: 'unread' | 'read' | 'dismissed'; created_at?: string; read_at?: string | null };
        Update: { id?: string; sender_id?: string; recipient_id?: string; media_id?: number; media_type?: MediaType; note?: string | null; status?: 'unread' | 'read' | 'dismissed'; created_at?: string; read_at?: string | null };
        Relationships: [];
      };
      progress_shares: {
        Row: { id: string; owner_id: string; friend_id: string; show_id: string; enabled: boolean; created_at: string; revoked_at: string | null };
        Insert: { id?: string; owner_id: string; friend_id: string; show_id: string; enabled?: boolean; created_at?: string; revoked_at?: string | null };
        Update: { id?: string; owner_id?: string; friend_id?: string; show_id?: string; enabled?: boolean; created_at?: string; revoked_at?: string | null };
        Relationships: [];
      };
      watch_parties: {
        Row: { id: string; host_id: string; show_id: string; episode_id: string; status: 'active' | 'ended'; position_seconds: number; is_playing: boolean; revision: number; created_at: string; updated_at: string };
        Insert: { id?: string; host_id: string; show_id: string; episode_id: string; status?: 'active' | 'ended'; position_seconds?: number; is_playing?: boolean; revision?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; host_id?: string; show_id?: string; episode_id?: string; status?: 'active' | 'ended'; position_seconds?: number; is_playing?: boolean; revision?: number; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      watch_party_members: {
        Row: { id: string; party_id: string; user_id: string; role: 'host' | 'participant'; joined_at: string };
        Insert: { id?: string; party_id: string; user_id: string; role?: 'host' | 'participant'; joined_at?: string };
        Update: { id?: string; party_id?: string; user_id?: string; role?: 'host' | 'participant'; joined_at?: string };
        Relationships: [];
      };
      watch_party_events: {
        Row: { id: string; party_id: string; actor_id: string; event_type: 'play' | 'pause' | 'seek' | 'heartbeat' | 'end'; position_seconds: number; revision: number; created_at: string };
        Insert: { id?: string; party_id: string; actor_id: string; event_type: 'play' | 'pause' | 'seek' | 'heartbeat' | 'end'; position_seconds: number; revision: number; created_at?: string };
        Update: { id?: string; party_id?: string; actor_id?: string; event_type?: 'play' | 'pause' | 'seek' | 'heartbeat' | 'end'; position_seconds?: number; revision?: number; created_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // ---- Friendship helpers (supabase/migrations/20260911_social_layer.sql) ----
      are_friends: {
        Args: { p_user_a: string; p_user_b: string };
        Returns: boolean;
      };
      is_blocked_between: {
        Args: { p_user_a: string; p_user_b: string };
        Returns: boolean;
      };
      send_friend_request: {
        Args: { p_addressee_id: string };
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
      block_user: {
        Args: { p_other_user_id: string };
        Returns: undefined;
      };
      unblock_user: {
        Args: { p_other_user_id: string };
        Returns: undefined;
      };
      list_friends: {
        Args: Record<string, never>;
        Returns: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; friends_since: string }[];
      };
      list_incoming_friend_requests: {
        Args: Record<string, never>;
        Returns: { request_id: string; user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; created_at: string }[];
      };
      list_outgoing_friend_requests: {
        Args: Record<string, never>;
        Returns: { request_id: string; user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; created_at: string }[];
      };
      list_blocked_users: {
        Args: Record<string, never>;
        Returns: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null }[];
      };
      search_users: {
        Args: { p_query: string };
        Returns: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; relationship: string; request_id: string | null }[];
      };
      set_username: {
        Args: { p_username: string };
        Returns: undefined;
      };
      // ---- show_recommendations RPCs ----
      recommend_title: {
        Args: { p_recipient_id: string; p_media_id: number; p_media_type: MediaType; p_note?: string | null };
        Returns: string;
      };
      set_recommendation_status: {
        Args: { p_id: string; p_status: 'read' | 'dismissed' };
        Returns: undefined;
      };
      withdraw_recommendation: {
        Args: { p_id: string };
        Returns: undefined;
      };
      list_incoming_recommendations: {
        Args: { p_include_dismissed?: boolean };
        Returns: {
          recommendation_id: string;
          media_id: number;
          media_type: MediaType;
          note: string | null;
          status: 'unread' | 'read' | 'dismissed';
          created_at: string;
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
        }[];
      };
      list_recommendation_targets: {
        Args: { p_media_id: number; p_media_type: MediaType };
        Returns: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; already_sent: boolean; recommendation_id: string | null }[];
      };
      // ---- progress_shares RPCs ----
      share_show_progress: {
        Args: { p_show_id: string; p_friend_id: string };
        Returns: undefined;
      };
      revoke_show_progress: {
        Args: { p_show_id: string; p_friend_id: string };
        Returns: undefined;
      };
      revoke_all_show_progress: {
        Args: { p_show_id: string };
        Returns: undefined;
      };
      list_share_targets: {
        Args: { p_show_id: string };
        Returns: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; is_shared: boolean }[];
      };
      list_my_progress_shares: {
        Args: Record<string, never>;
        Returns: { show_id: string; user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; created_at: string }[];
      };
      list_friend_show_progress: {
        Args: { p_show_id: string };
        Returns: {
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          season_number: number | null;
          episode_number: number | null;
          progress_percent: number;
          last_watched_at: string;
          is_ahead: boolean;
        }[];
      };
      // ---- Watch parties ----
      is_party_member: {
        Args: { p_party_id: string; p_user_id: string };
        Returns: boolean;
      };
      watch_party_host: {
        Args: { p_party_id: string };
        Returns: string | null;
      };
      create_watch_party: {
        Args: { p_show_id: string; p_episode_id: string };
        Returns: string;
      };
      invite_to_watch_party: {
        Args: { p_party_id: string; p_friend_id: string };
        Returns: undefined;
      };
      leave_watch_party: {
        Args: { p_party_id: string };
        Returns: undefined;
      };
      update_party_playback: {
        Args: { p_party_id: string; p_position_seconds: number; p_is_playing: boolean; p_event_type: 'play' | 'pause' | 'seek' };
        Returns: number;
      };
      end_watch_party: {
        Args: { p_party_id: string };
        Returns: undefined;
      };
      list_my_watch_parties: {
        Args: Record<string, never>;
        Returns: {
          party_id: string;
          show_id: string;
          episode_id: string;
          is_host: boolean;
          member_count: number;
          host_user_id: string;
          host_username: string | null;
          host_full_name: string | null;
          host_avatar_url: string | null;
          created_at: string;
        }[];
      };
      list_party_members: {
        Args: { p_party_id: string };
        Returns: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; is_host: boolean; joined_at: string }[];
      };
      list_party_invite_targets: {
        Args: { p_party_id: string };
        Returns: { user_id: string; username: string | null; full_name: string | null; avatar_url: string | null; is_invited: boolean }[];
      };
    };
    Enums: { [_ in never]: never };
  };
}
