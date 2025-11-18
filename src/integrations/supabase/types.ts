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
          category: string
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          points_reward: number
          requirement_type: string
          requirement_value: number
          tier: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          icon: string
          id?: string
          name: string
          points_reward?: number
          requirement_type: string
          requirement_value: number
          tier?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          points_reward?: number
          requirement_type?: string
          requirement_value?: number
          tier?: string
        }
        Relationships: []
      }
      admin_instructors: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          instructor_id: string
          org_id: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          instructor_id: string
          org_id?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          instructor_id?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_instructors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_explanation_cache: {
        Row: {
          correct_answer: string
          created_at: string
          explanation: string
          id: string
          last_used_at: string
          question_hash: string
          usage_count: number
          wrong_answer: string
        }
        Insert: {
          correct_answer: string
          created_at?: string
          explanation: string
          id?: string
          last_used_at?: string
          question_hash: string
          usage_count?: number
          wrong_answer: string
        }
        Update: {
          correct_answer?: string
          created_at?: string
          explanation?: string
          id?: string
          last_used_at?: string
          question_hash?: string
          usage_count?: number
          wrong_answer?: string
        }
        Relationships: []
      }
      ai_quality_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: string
          rating_type: string
          reference_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: string
          rating_type: string
          reference_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: string
          rating_type?: string
          reference_id?: string
          user_id?: string
        }
        Relationships: []
      }
      answer_version_history: {
        Row: {
          answer_copied: boolean | null
          answer_copy_count: number | null
          answer_copy_events: Json | null
          assignment_id: string
          created_at: string
          editing_events_after_first_paste: number | null
          final_answer_length: number | null
          first_interaction_at: string | null
          first_interaction_size: number | null
          first_interaction_type: string | null
          id: string
          longest_absence_seconds: number
          pasted_count: number
          question_copied: boolean | null
          question_copied_at: string | null
          question_displayed_at: string | null
          student_id: string
          switched_away_immediately: boolean
          tab_switch_count: number
          tab_switches: Json
          total_time_away_seconds: number
          typed_count: number
          updated_at: string
          version_events: Json
        }
        Insert: {
          answer_copied?: boolean | null
          answer_copy_count?: number | null
          answer_copy_events?: Json | null
          assignment_id: string
          created_at?: string
          editing_events_after_first_paste?: number | null
          final_answer_length?: number | null
          first_interaction_at?: string | null
          first_interaction_size?: number | null
          first_interaction_type?: string | null
          id?: string
          longest_absence_seconds?: number
          pasted_count?: number
          question_copied?: boolean | null
          question_copied_at?: string | null
          question_displayed_at?: string | null
          student_id: string
          switched_away_immediately?: boolean
          tab_switch_count?: number
          tab_switches?: Json
          total_time_away_seconds?: number
          typed_count?: number
          updated_at?: string
          version_events?: Json
        }
        Update: {
          answer_copied?: boolean | null
          answer_copy_count?: number | null
          answer_copy_events?: Json | null
          assignment_id?: string
          created_at?: string
          editing_events_after_first_paste?: number | null
          final_answer_length?: number | null
          first_interaction_at?: string | null
          first_interaction_size?: number | null
          first_interaction_type?: string | null
          id?: string
          longest_absence_seconds?: number
          pasted_count?: number
          question_copied?: boolean | null
          question_copied_at?: string | null
          question_displayed_at?: string | null
          student_id?: string
          switched_away_immediately?: boolean
          tab_switch_count?: number
          tab_switches?: Json
          total_time_away_seconds?: number
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
      checkin_streaks: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_correct_date: string | null
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_correct_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_correct_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          code_example: string | null
          created_at: string
          demo_snippets: Json | null
          id: string
          instructor_id: string
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          slide_text?: string
          status?: Database["public"]["Enums"]["draft_status"]
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_students: {
        Row: {
          created_at: string | null
          id: string
          instructor_id: string
          org_id: string | null
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructor_id: string
          org_id?: string | null
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instructor_id?: string
          org_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_students_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_questions: {
        Row: {
          created_at: string
          id: string
          instructor_id: string
          org_id: string | null
          questions: Json
          status: string
          transcript_snippet: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructor_id: string
          org_id?: string | null
          questions: Json
          status?: string
          transcript_snippet: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructor_id?: string
          org_id?: string | null
          questions?: Json
          status?: string
          transcript_snippet?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string | null
          id?: string
          lesson_id: string
          org_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string | null
          id?: string
          lesson_id?: string
          org_id?: string | null
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
          {
            foreignKeyName: "lesson_progress_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string | null
          read: boolean | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          org_id?: string | null
          read?: boolean | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          org_id?: string | null
          read?: boolean | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          admin_code: string
          created_at: string | null
          id: string
          instructor_invite_code: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          admin_code: string
          created_at?: string | null
          id?: string
          instructor_invite_code: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          admin_code?: string
          created_at?: string | null
          id?: string
          instructor_invite_code?: string
          name?: string
          slug?: string
          updated_at?: string | null
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
            referencedRelation: "stem_problems_student_view"
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
          auto_grade_coding: boolean | null
          auto_grade_mcq: boolean | null
          auto_grade_model: string
          auto_grade_short_answer: boolean | null
          auto_question_enabled: boolean | null
          auto_question_force_send: boolean | null
          auto_question_interval: number | null
          course_schedule: string | null
          course_title: string | null
          course_topics: string[] | null
          created_at: string | null
          daily_question_limit: number | null
          experience_level: string | null
          full_name: string | null
          goals: string[] | null
          id: string
          instructor_code: string | null
          last_auto_question_at: string | null
          onboarded: boolean | null
          org_id: string | null
          professor_type: Database["public"]["Enums"]["professor_type"] | null
          question_format_preference: string | null
          study_days: string[] | null
        }
        Insert: {
          auto_grade_coding?: boolean | null
          auto_grade_mcq?: boolean | null
          auto_grade_model?: string
          auto_grade_short_answer?: boolean | null
          auto_question_enabled?: boolean | null
          auto_question_force_send?: boolean | null
          auto_question_interval?: number | null
          course_schedule?: string | null
          course_title?: string | null
          course_topics?: string[] | null
          created_at?: string | null
          daily_question_limit?: number | null
          experience_level?: string | null
          full_name?: string | null
          goals?: string[] | null
          id: string
          instructor_code?: string | null
          last_auto_question_at?: string | null
          onboarded?: boolean | null
          org_id?: string | null
          professor_type?: Database["public"]["Enums"]["professor_type"] | null
          question_format_preference?: string | null
          study_days?: string[] | null
        }
        Update: {
          auto_grade_coding?: boolean | null
          auto_grade_mcq?: boolean | null
          auto_grade_model?: string
          auto_grade_short_answer?: boolean | null
          auto_question_enabled?: boolean | null
          auto_question_force_send?: boolean | null
          auto_question_interval?: number | null
          course_schedule?: string | null
          course_title?: string | null
          course_topics?: string[] | null
          created_at?: string | null
          daily_question_limit?: number | null
          experience_level?: string | null
          full_name?: string | null
          goals?: string[] | null
          id?: string
          instructor_code?: string | null
          last_auto_question_at?: string | null
          onboarded?: boolean | null
          org_id?: string | null
          professor_type?: Database["public"]["Enums"]["professor_type"] | null
          question_format_preference?: string | null
          study_days?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      question_send_logs: {
        Row: {
          ai_confidence: number | null
          batch_count: number | null
          created_at: string | null
          error_message: string | null
          error_type: string | null
          failed_sends: number
          id: string
          instructor_id: string
          processing_time_ms: number | null
          question_text: string
          question_type: string
          source: string
          student_count: number
          success: boolean
          successful_sends: number
        }
        Insert: {
          ai_confidence?: number | null
          batch_count?: number | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          failed_sends?: number
          id?: string
          instructor_id: string
          processing_time_ms?: number | null
          question_text: string
          question_type: string
          source: string
          student_count: number
          success: boolean
          successful_sends?: number
        }
        Update: {
          ai_confidence?: number | null
          batch_count?: number | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          failed_sends?: number
          id?: string
          instructor_id?: string
          processing_time_ms?: number | null
          question_text?: string
          question_type?: string
          source?: string
          student_count?: number
          success?: boolean
          successful_sends?: number
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          key: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          key?: string
          window_start?: string
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
            referencedRelation: "stem_problems_student_view"
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
          ai_summary: Json | null
          answers_released: boolean
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          auto_delete_at: string | null
          auto_release_at: string | null
          auto_release_enabled: boolean | null
          auto_release_minutes: number | null
          completed: boolean
          content: Json
          created_at: string
          draft_id: string | null
          grade: number | null
          id: string
          instructor_id: string
          mode: Database["public"]["Enums"]["assignment_mode"]
          opened_at: string | null
          org_id: string | null
          quiz_responses: Json | null
          release_method: string | null
          response_time_seconds: number | null
          saved_by_student: boolean | null
          student_id: string
          title: string
        }
        Insert: {
          ai_summary?: Json | null
          answers_released?: boolean
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          auto_delete_at?: string | null
          auto_release_at?: string | null
          auto_release_enabled?: boolean | null
          auto_release_minutes?: number | null
          completed?: boolean
          content: Json
          created_at?: string
          draft_id?: string | null
          grade?: number | null
          id?: string
          instructor_id: string
          mode: Database["public"]["Enums"]["assignment_mode"]
          opened_at?: string | null
          org_id?: string | null
          quiz_responses?: Json | null
          release_method?: string | null
          response_time_seconds?: number | null
          saved_by_student?: boolean | null
          student_id: string
          title: string
        }
        Update: {
          ai_summary?: Json | null
          answers_released?: boolean
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          auto_delete_at?: string | null
          auto_release_at?: string | null
          auto_release_enabled?: boolean | null
          auto_release_minutes?: number | null
          completed?: boolean
          content?: Json
          created_at?: string
          draft_id?: string | null
          grade?: number | null
          id?: string
          instructor_id?: string
          mode?: Database["public"]["Enums"]["assignment_mode"]
          opened_at?: string | null
          org_id?: string | null
          quiz_responses?: Json | null
          release_method?: string | null
          response_time_seconds?: number | null
          saved_by_student?: boolean | null
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
          {
            foreignKeyName: "student_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      student_connection_health: {
        Row: {
          checked_at: string | null
          id: string
          instructor_id: string
          student_count: number
        }
        Insert: {
          checked_at?: string | null
          id?: string
          instructor_id: string
          student_count: number
        }
        Update: {
          checked_at?: string | null
          id?: string
          instructor_id?: string
          student_count?: number
        }
        Relationships: []
      }
      student_paste_events: {
        Row: {
          assignment_id: string
          assignment_title: string | null
          created_at: string | null
          id: string
          pasted_at: string | null
          pasted_text_length: number
          student_id: string
          student_name: string | null
        }
        Insert: {
          assignment_id: string
          assignment_title?: string | null
          created_at?: string | null
          id?: string
          pasted_at?: string | null
          pasted_text_length: number
          student_id: string
          student_name?: string | null
        }
        Update: {
          assignment_id?: string
          assignment_title?: string | null
          created_at?: string | null
          id?: string
          pasted_at?: string | null
          pasted_text_length?: number
          student_id?: string
          student_name?: string | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          org_id: string | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          org_id?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          org_id?: string | null
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
          {
            foreignKeyName: "user_achievements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      stem_problems_student_view: {
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
      add_instructor_for_admin: {
        Args: { _instructor_code: string }
        Returns: string
      }
      assign_oauth_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      auto_release_expired_answers: { Args: never; Returns: number }
      calculate_auto_release_time: {
        Args: { p_created_at: string; p_minutes: number }
        Returns: string
      }
      calculate_mastery_threshold: {
        Args: { p_lesson_id: string; p_user_id: string }
        Returns: number
      }
      can_view_user: {
        Args: { _target_user_id: string; _viewer_id: string }
        Returns: boolean
      }
      cleanup_old_question_logs: { Args: never; Returns: number }
      cleanup_old_rate_limits: { Args: never; Returns: number }
      cleanup_unsaved_lecture_checkins: { Args: never; Returns: number }
      generate_admin_code: { Args: never; Returns: string }
      generate_instructor_code: { Args: never; Returns: string }
      generate_org_invite_code: { Args: never; Returns: string }
      get_problem_answer: {
        Args: { problem_id: string }
        Returns: {
          correct_answer: string
          explanation: string
        }[]
      }
      get_question_success_rate: {
        Args: { p_days?: number; p_instructor_id: string }
        Returns: {
          avg_processing_time_ms: number
          failed_questions: number
          most_common_error: string
          success_rate: number
          successful_questions: number
          total_questions: number
        }[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_auto_release_timer: {
        Args: { p_assignment_ids: string[]; p_minutes: number }
        Returns: undefined
      }
      submit_quiz: {
        Args: { p_assignment_id: string; p_user_answers: Json }
        Returns: Json
      }
      update_assignment_grade: {
        Args: { p_assignment_id: string; p_short_answer_grades: Json }
        Returns: Json
      }
      validate_admin_code: { Args: { _code: string }; Returns: string }
      validate_instructor_code: { Args: { code: string }; Returns: string }
      validate_org_invite_code: { Args: { _code: string }; Returns: string }
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
      professor_type: "stem" | "humanities"
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
      professor_type: ["stem", "humanities"],
    },
  },
} as const
