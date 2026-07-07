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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at: string | null
          id: string
          list_id: string | null
          media_id: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at?: string | null
          id?: string
          list_id?: string | null
          media_id?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string | null
          id?: string
          list_id?: string | null
          media_id?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_requests: {
        Row: {
          created_at: string
          requester_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          requester_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          requester_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      list_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          list_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          list_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          list_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_comments_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          added_at: string | null
          created_at: string
          id: string
          list_id: string
          media_id: string
          note: string | null
          position: number | null
          reason: string | null
        }
        Insert: {
          added_at?: string | null
          created_at?: string
          id?: string
          list_id: string
          media_id: string
          note?: string | null
          position?: number | null
          reason?: string | null
        }
        Update: {
          added_at?: string | null
          created_at?: string
          id?: string
          list_id?: string
          media_id?: string
          note?: string | null
          position?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      list_likes: {
        Row: {
          created_at: string | null
          list_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          list_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_likes_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      list_saves: {
        Row: {
          created_at: string
          list_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          list_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_saves_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          comments_count: number
          created_at: string | null
          description: string | null
          featured: boolean
          id: string
          item_count: number
          like_count: number | null
          list_type: Database["public"]["Enums"]["list_type"]
          media_types: Database["public"]["Enums"]["media_type"][]
          ranked: boolean
          saves_count: number
          source_media_id: string | null
          tags: string[]
          title: string
          updated_at: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["list_visibility"]
        }
        Insert: {
          comments_count?: number
          created_at?: string | null
          description?: string | null
          featured?: boolean
          id?: string
          item_count?: number
          like_count?: number | null
          list_type?: Database["public"]["Enums"]["list_type"]
          media_types?: Database["public"]["Enums"]["media_type"][]
          ranked?: boolean
          saves_count?: number
          source_media_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string | null
          user_id: string
          visibility?: Database["public"]["Enums"]["list_visibility"]
        }
        Update: {
          comments_count?: number
          created_at?: string | null
          description?: string | null
          featured?: boolean
          id?: string
          item_count?: number
          like_count?: number | null
          list_type?: Database["public"]["Enums"]["list_type"]
          media_types?: Database["public"]["Enums"]["media_type"][]
          ranked?: boolean
          saves_count?: number
          source_media_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["list_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "lists_source_media_id_fkey"
            columns: ["source_media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          avg_rating: number | null
          backdrop_url: string | null
          completed_count: number
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          external_ids: Json | null
          favorites_count: number
          id: string
          in_progress_count: number
          lists_count: number
          media_type: Database["public"]["Enums"]["media_type"]
          metadata: Json | null
          rating_count: number | null
          rating_distribution: number[]
          recommendations_count: number
          recommended_for_count: number
          release_date: string | null
          series_id: string | null
          series_name: string | null
          series_position: number | null
          series_status: string | null
          title: string
          tracking_count: number | null
          updated_at: string | null
        }
        Insert: {
          avg_rating?: number | null
          backdrop_url?: string | null
          completed_count?: number
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          external_ids?: Json | null
          favorites_count?: number
          id?: string
          in_progress_count?: number
          lists_count?: number
          media_type: Database["public"]["Enums"]["media_type"]
          metadata?: Json | null
          rating_count?: number | null
          rating_distribution?: number[]
          recommendations_count?: number
          recommended_for_count?: number
          release_date?: string | null
          series_id?: string | null
          series_name?: string | null
          series_position?: number | null
          series_status?: string | null
          title: string
          tracking_count?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_rating?: number | null
          backdrop_url?: string | null
          completed_count?: number
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          external_ids?: Json | null
          favorites_count?: number
          id?: string
          in_progress_count?: number
          lists_count?: number
          media_type?: Database["public"]["Enums"]["media_type"]
          metadata?: Json | null
          rating_count?: number | null
          rating_distribution?: number[]
          recommendations_count?: number
          recommended_for_count?: number
          release_date?: string | null
          series_id?: string | null
          series_name?: string | null
          series_position?: number | null
          series_status?: string | null
          title?: string
          tracking_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      media_tags: {
        Row: {
          media_id: string
          relevance: number | null
          tag_id: string
        }
        Insert: {
          media_id: string
          relevance?: number | null
          tag_id: string
        }
        Update: {
          media_id?: string
          relevance?: number | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_tags_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          favorite_media_id: string | null
          followers_count: number
          following_count: number
          id: string
          is_private: boolean
          updated_at: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          favorite_media_id?: string | null
          followers_count?: number
          following_count?: number
          id: string
          is_private?: boolean
          updated_at?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          favorite_media_id?: string | null
          followers_count?: number
          following_count?: number
          id?: string
          is_private?: boolean
          updated_at?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_favorite_media"
            columns: ["favorite_media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          created_at: string
          id: string
          note: string | null
          recommended_media_id: string
          source_media_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          recommended_media_id: string
          source_media_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          recommended_media_id?: string
          source_media_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_recommended_media_id_fkey"
            columns: ["recommended_media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_source_media_id_fkey"
            columns: ["source_media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shelf_items: {
        Row: {
          added_at: string | null
          id: string
          media_id: string
          note: string | null
          position: number | null
          shelf_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          media_id: string
          note?: string | null
          position?: number | null
          shelf_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          media_id?: string
          note?: string | null
          position?: number | null
          shelf_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shelf_items_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shelf_items_shelf_id_fkey"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "shelves"
            referencedColumns: ["id"]
          },
        ]
      }
      shelves: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          position: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          position?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          position?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shelves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: Database["public"]["Enums"]["tag_category"]
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["tag_category"]
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["tag_category"]
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_media: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          is_favorite: boolean | null
          media_id: string
          progress: Json | null
          rating: number | null
          review: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["tracking_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_favorite?: boolean | null
          media_id: string
          progress?: Json | null
          rating?: number | null
          review?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tracking_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          is_favorite?: boolean | null
          media_id?: string
          progress?: Json | null
          rating?: number | null
          review?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tracking_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_media_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_follow_request: {
        Args: { p_requester_id: string }
        Returns: undefined
      }
      block_user: { Args: { p_target_id: string }; Returns: undefined }
      popular_lists_in_window: {
        Args: { lim?: number; window_start: string }
        Returns: {
          list_id: string
          recent_likes: number
        }[]
      }
      recently_liked_lists: {
        Args: { lim?: number }
        Returns: {
          last_liked: string
          list_id: string
        }[]
      }
      user_follows_user: {
        Args: { follower: string; target: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "added_to_shelf"
        | "rated"
        | "reviewed"
        | "completed"
        | "created_list"
        | "started"
        | "status_changed"
        | "favorited"
        | "removed"
        | "logged_episode"
        | "logged_season"
        | "added_to_top"
        | "removed_from_top"
        | "started_reading"
        | "liked_list"
        | "saved_list"
        | "recommended"
      list_type:
        | "curated"
        | "if_you_liked"
        | "genre"
        | "vibe"
        | "mood"
        | "cross_media"
      list_visibility: "public" | "unlisted" | "friends_unlisted" | "private"
      media_type: "book" | "movie" | "tv_show" | "video_game" | "board_game"
      tag_category: "genre" | "mood" | "theme" | "setting" | "pacing" | "tone"
      tracking_status:
        | "want"
        | "in_progress"
        | "completed"
        | "dropped"
        | "on_hold"
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
      activity_type: [
        "added_to_shelf",
        "rated",
        "reviewed",
        "completed",
        "created_list",
        "started",
        "status_changed",
        "favorited",
        "removed",
        "logged_episode",
        "logged_season",
        "added_to_top",
        "removed_from_top",
        "started_reading",
        "liked_list",
        "saved_list",
        "recommended",
      ],
      list_type: [
        "curated",
        "if_you_liked",
        "genre",
        "vibe",
        "mood",
        "cross_media",
      ],
      list_visibility: ["public", "unlisted", "friends_unlisted", "private"],
      media_type: ["book", "movie", "tv_show", "video_game", "board_game"],
      tag_category: ["genre", "mood", "theme", "setting", "pacing", "tone"],
      tracking_status: [
        "want",
        "in_progress",
        "completed",
        "dropped",
        "on_hold",
      ],
    },
  },
} as const
