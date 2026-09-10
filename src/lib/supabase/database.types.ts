export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MediaType = 'movie' | 'tv';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; full_name: string | null; avatar_url: string | null; created_at: string; updated_at: string };
        Insert: { id: string; email: string; full_name?: string | null; avatar_url?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; email?: string; full_name?: string | null; avatar_url?: string | null; created_at?: string; updated_at?: string };
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
        Row: { id: string; episode_id: string; event_order: number; title: string; summary: string; spoiler_boundary: string; created_at: string };
        Insert: { id?: string; episode_id: string; event_order: number; title: string; summary: string; spoiler_boundary: string; created_at?: string };
        Update: { id?: string; episode_id?: string; event_order?: number; title?: string; summary?: string; spoiler_boundary?: string; created_at?: string };
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
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
  };
}
