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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          points_reward: number
          requirement_type: string
          requirement_value: number
        }
        Insert: {
          created_at?: string
          description: string
          icon: string
          id?: string
          name: string
          points_reward?: number
          requirement_type: string
          requirement_value: number
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          points_reward?: number
          requirement_type?: string
          requirement_value?: number
        }
        Relationships: []
      }
      answer_version_history: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          pasted_count: number
          student_id: string
          typed_count: number
          updated_at: string
          version_events: Json
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          pasted_count?: number
          student_id: string
          typed_count?: number
          updated_at?: string
          version_events?: Json
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          pasted_count?: number
          student_id?: string
          typed_count?: number
          updated_at?: string
          version_events?: Json
        }
        Relationships: [
          {
            foreignKeyName: "answer_version_history_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "student_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      content_drafts: {
        Row: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          code_example: string | null
          created_at: string
          demo_snippets: Json | null
          id: string
          instructor_id: string
          slide_text: string
          status: Database["public"]["Enums"]["draft_status"]
          topic: string
          updated_at: string
        }
        Insert: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          code_example?: string | null
          created_at?: string
          demo_snippets?: Json | null
          id?: string
          instructor_id: string
          slide_text: string
          status?: Database["public"]["Enums"]["draft_status"]
          topic: string
          updated_at?: string
        }
        Update: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          code_example?: string | null
          created_at?: string
          demo_snippets?: Json | null
          id?: string
          instructor_id?: string
          slide_text?: string
          status?: Database["public"]["Enums"]["draft_status"]
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      instructor_students: {
        Row: {
          created_at: string | null
          id: string
          instructor_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructor_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instructor_id?: string
          student_id?: string
        }
        Relationships: []
      }
      lecture_materials: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          instructor_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          instructor_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          instructor_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lecture_questions: {
        Row: {
          created_at: string
          id: string
          instructor_id: string
          questions: Json
          status: string
          transcript_snippet: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructor_id: string
          questions: Json
          status?: string
          transcript_snippet: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructor_id?: string
          questions?: Json
          status?: string
          transcript_snippet?: string
          updated_at?: string
        }
        Relationships: []
      }
      lesson_mastery: {
        Row: {
          attempt_count: number
          created_at: string | null
          id: string
          is_mastered: boolean
          last_attempt_date: string | null
          lesson_id: string
          mastery_threshold: number
          successful_attempts: number
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string | null
          id?: string
          is_mastered?: boolean
          last_attempt_date?: string | null
          lesson_id: string
          mastery_threshold?: number
          successful_attempts?: number
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string | null
          id?: string
          is_mastered?: boolean
          last_attempt_date?: string | null
          lesson_id?: string
          mastery_threshold?: number
          successful_attempts?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_mastery_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          created_at: string | null
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string | null
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string | null
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          step_number: number
          title: string
          type: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          step_number: number
          title: string
          type: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          step_number?: number
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          read: boolean | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      problem_attempts: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          problem_id: string
          time_spent_seconds: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct: boolean
          problem_id: string
          time_spent_seconds?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          problem_id?: string
          time_spent_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_attempts_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "stem_problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_attempts_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "student_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          course_schedule: string | null
          course_title: string | null
          course_topics: string[] | null
          created_at: string | null
          experience_level: string | null
          full_name: string | null
          goals: string[] | null
          id: string
          instructor_code: string | null
          onboarded: boolean | null
          study_days: string[] | null
        }
        Insert: {
          course_schedule?: string | null
          course_title?: string | null
          course_topics?: string[] | null
          created_at?: string | null
          experience_level?: string | null
          full_name?: string | null
          goals?: string[] | null
          id: string
          instructor_code?: string | null
          onboarded?: boolean | null
          study_days?: string[] | null
        }
        Update: {
          course_schedule?: string | null
          course_title?: string | null
          course_topics?: string[] | null
          created_at?: string | null
          experience_level?: string | null
          full_name?: string | null
          goals?: string[] | null
          id?: string
          instructor_code?: string | null
          onboarded?: boolean | null
          study_days?: string[] | null
        }
        Relationships: []
      }
      spaced_repetition: {
        Row: {
          created_at: string
          ease_factor: number
          id: string
          interval_days: number
          last_reviewed_date: string | null
          next_review_date: string
          problem_id: string
          repetition_number: number
          user_id: string
        }
        Insert: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_date?: string | null
          next_review_date?: string
          problem_id: string
          repetition_number?: number
          user_id: string
        }
        Update: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_date?: string | null
          next_review_date?: string
          problem_id?: string
          repetition_number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaced_repetition_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "stem_problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaced_repetition_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "student_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      stem_problems: {
        Row: {
          correct_answer: string
          created_at: string
          difficulty: string
          explanation: string | null
          id: string
          options: Json | null
          points_reward: number
          problem_text: string
          subject: string
        }
        Insert: {
          correct_answer: string
          created_at?: string
          difficulty: string
          explanation?: string | null
          id?: string
          options?: Json | null
          points_reward?: number
          problem_text: string
          subject: string
        }
        Update: {
          correct_answer?: string
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          options?: Json | null
          points_reward?: number
          problem_text?: string
          subject?: string
        }
        Relationships: []
      }
      student_assignments: {
        Row: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          completed: boolean
          content: Json
          created_at: string
          draft_id: string | null
          grade: number | null
          id: string
          instructor_id: string
          mode: Database["public"]["Enums"]["assignment_mode"]
          quiz_responses: Json | null
          student_id: string
          title: string
        }
        Insert: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          completed?: boolean
          content: Json
          created_at?: string
          draft_id?: string | null
          grade?: number | null
          id?: string
          instructor_id: string
          mode: Database["public"]["Enums"]["assignment_mode"]
          quiz_responses?: Json | null
          student_id: string
          title: string
        }
        Update: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          completed?: boolean
          content?: Json
          created_at?: string
          draft_id?: string | null
          grade?: number | null
          id?: string
          instructor_id?: string
          mode?: Database["public"]["Enums"]["assignment_mode"]
          quiz_responses?: Json | null
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_assignments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "content_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          coins: number
          created_at: string
          current_streak: number
          experience_points: number
          id: string
          last_activity_date: string | null
          level: number
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coins?: number
          created_at?: string
          current_streak?: number
          experience_points?: number
          id?: string
          last_activity_date?: string | null
          level?: number
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          current_streak?: number
          experience_points?: number
          id?: string
          last_activity_date?: string | null
          level?: number
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          age: number | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          phone: string | null
          user_id: string | null
        }
        Insert: {
          age?: number | null
          created_at?: string | null
          email?: string | null
          id: string
          name?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          age?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      student_problems: {
        Row: {
          created_at: string | null
          difficulty: string | null
          id: string | null
          options: Json | null
          points_reward: number | null
          problem_text: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          difficulty?: string | null
          id?: string | null
          options?: Json | null
          points_reward?: number | null
          problem_text?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          difficulty?: string | null
          id?: string | null
          options?: Json | null
          points_reward?: number | null
          problem_text?: string | null
          subject?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_mastery_threshold: {
        Args: { p_lesson_id: string; p_user_id: string }
        Returns: number
      }
      can_view_user: {
        Args: { _target_user_id: string; _viewer_id: string }
        Returns: boolean
      }
      generate_instructor_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_problem_answer: {
        Args: { problem_id: string }
        Returns: {
          correct_answer: string
          explanation: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      submit_quiz: {
        Args: { p_assignment_id: string; p_user_answers: Json }
        Returns: Json
      }
      validate_instructor_code: {
        Args: { code: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "instructor" | "student"
      assignment_mode:
        | "hints_only"
        | "hints_solutions"
        | "auto_grade"
        | "manual_grade"
      assignment_type: "quiz" | "lesson" | "mini_project" | "lecture_checkin"
      draft_status: "draft" | "approved" | "published"
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
      app_role: ["admin", "instructor", "student"],
      assignment_mode: [
        "hints_only",
        "hints_solutions",
        "auto_grade",
        "manual_grade",
      ],
      assignment_type: ["quiz", "lesson", "mini_project", "lecture_checkin"],
      draft_status: ["draft", "approved", "published"],
    },
  },
} as const
