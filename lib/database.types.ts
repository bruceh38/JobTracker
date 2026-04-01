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
      jobs: {
        Row: {
          id: string;
          user_id: string | null;
          company: string;
          role: string;
          status: "applied" | "oa" | "interview" | "rejected" | "accepted";
          job_description: string | null;
          job_url: string | null;
          analysis: Json | null;
          analysis_updated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          company: string;
          role: string;
          status?: "applied" | "oa" | "interview" | "rejected" | "accepted";
          job_description?: string | null;
          job_url?: string | null;
          analysis?: Json | null;
          analysis_updated_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          company?: string;
          role?: string;
          status?: "applied" | "oa" | "interview" | "rejected" | "accepted";
          job_description?: string | null;
          job_url?: string | null;
          analysis?: Json | null;
          analysis_updated_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_background: {
        Row: {
          user_id: string;
          background: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          background?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          background?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
