import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useStudentConnectionHealth = (isRecording: boolean, instructorId: string | null) => {
  const [studentCount, setStudentCount] = useState<number>(0);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const previousCountRef = useRef<number>(0);
  const { toast } = useToast();

  useEffect(() => {
    if (!isRecording || !instructorId) return;

    const checkConnections = async () => {
      try {
        const { data: students, error } = await supabase
          .from('instructor_students')
          .select('student_id')
          .eq('instructor_id', instructorId);

        if (error) {
          console.error('Connection health check failed:', error);
          setHealthStatus('error');
          return;
        }

        const currentCount = students?.length || 0;
        setStudentCount(currentCount);
        setLastChecked(new Date());

        // Alert if student count drops significantly
        if (previousCountRef.current > 0 && currentCount < previousCountRef.current * 0.5) {
          setHealthStatus('warning');
          toast({
            title: "⚠️ Connection alert",
            description: `Student count dropped from ${previousCountRef.current} to ${currentCount}`,
            variant: "destructive",
            duration: 5000,
          });
        } else if (currentCount === 0) {
          setHealthStatus('warning');
        } else {
          setHealthStatus('healthy');
        }

        previousCountRef.current = currentCount;

        // Log to health table every 5 minutes
        const minutesSinceLastLog = (Date.now() - lastChecked.getTime()) / (1000 * 60);
        if (minutesSinceLastLog >= 5) {
          await supabase
            .from('student_connection_health')
            .insert({
              instructor_id: instructorId,
              student_count: currentCount
            });
        }
      } catch (error) {
        console.error('Health check error:', error);
        setHealthStatus('error');
      }
    };

    // Initial check
    checkConnections();

    // Check every 30 seconds when recording
    const interval = setInterval(checkConnections, 30000);

    return () => clearInterval(interval);
  }, [isRecording, instructorId, toast]);

  return {
    studentCount,
    lastChecked,
    healthStatus,
  };
};
