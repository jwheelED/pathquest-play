import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SyncGradeParams {
  assignmentId: string;
  studentId: string;
  scoreGiven: number;
  scoreMaximum: number;
  assignmentType: string;
  lmsStudentEmail?: string;
}

/**
 * Sync a single grade to all active LMS platforms.
 * Call this after grading or answer release.
 */
export async function syncGradeToLMS(params: SyncGradeParams): Promise<boolean> {
  try {
    // Refresh session before calling edge function
    await supabase.auth.refreshSession();
    
    const { data, error } = await supabase.functions.invoke("sync-grade-to-lms", {
      body: {
        assignment_id: params.assignmentId,
        student_id: params.studentId,
        score_given: params.scoreGiven,
        score_maximum: params.scoreMaximum,
        assignment_type: params.assignmentType,
        lms_student_email: params.lmsStudentEmail,
      },
    });

    if (error) {
      console.error("LMS sync error:", error);
      return false;
    }

    if (data?.synced) {
      const results = data.results || [];
      const failed = results.filter((r: any) => !r.success);
      if (failed.length > 0) {
        console.warn("Some LMS syncs failed:", failed);
      }
      return true;
    }

    return false;
  } catch (err) {
    console.error("LMS sync exception:", err);
    return false;
  }
}

/**
 * Bulk sync grades for multiple assignments.
 */
export async function bulkSyncGradesToLMS(
  grades: SyncGradeParams[],
  onProgress?: (completed: number, total: number) => void,
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < grades.length; i++) {
    const ok = await syncGradeToLMS(grades[i]);
    if (ok) success++;
    else failed++;
    onProgress?.(i + 1, grades.length);
  }

  return { success, failed };
}
