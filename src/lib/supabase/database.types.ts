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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
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
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

