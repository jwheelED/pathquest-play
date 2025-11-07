import { useState, useEffect, useRef } from 'react';

interface TabSwitch {
  left_at: string;
  returned_at: string;
  duration_seconds: number;
}

interface TabSwitchingData {
  tab_switch_count: number;
  total_time_away_seconds: number;
  tab_switches: TabSwitch[];
  longest_absence_seconds: number;
  switched_away_immediately: boolean;
  question_displayed_at: string;
}

export const useTabSwitchingDetection = (isActive: boolean) => {
  const [tabSwitches, setTabSwitches] = useState<TabSwitch[]>([]);
  const [lastTabLeaveTime, setLastTabLeaveTime] = useState<Date | null>(null);
  const questionDisplayedAtRef = useRef<string | null>(null);
  const hasStartedRef = useRef(false);

  // Set the question displayed time when tracking becomes active
  useEffect(() => {
    if (isActive && !hasStartedRef.current) {
      questionDisplayedAtRef.current = new Date().toISOString();
      hasStartedRef.current = true;
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    const handleVisibilityChange = () => {
      console.log('👀 [TabSwitching] Visibility change:', {
        hidden: document.hidden,
        isActive,
        hasStarted: hasStartedRef.current
      });
      
      if (document.hidden) {
        // User switched away from tab
        setLastTabLeaveTime(new Date());
        console.log('🚪 [TabSwitching] Student left tab at:', new Date().toISOString());
      } else if (lastTabLeaveTime) {
        // User returned to tab
        const returnTime = new Date();
        const durationSeconds = Math.floor(
          (returnTime.getTime() - lastTabLeaveTime.getTime()) / 1000
        );
        
        console.log('🔙 [TabSwitching] Student returned to tab:', {
          duration: durationSeconds,
          left_at: lastTabLeaveTime.toISOString(),
          returned_at: returnTime.toISOString()
        });

        setTabSwitches((prev) => [
          ...prev,
          {
            left_at: lastTabLeaveTime.toISOString(),
            returned_at: returnTime.toISOString(),
            duration_seconds: durationSeconds,
          },
        ]);

        setLastTabLeaveTime(null);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, lastTabLeaveTime]);

  const getTabSwitchingData = (): TabSwitchingData | null => {
    if (!hasStartedRef.current || !questionDisplayedAtRef.current) {
      return null;
    }

    const totalTimeAwaySeconds = tabSwitches.reduce(
      (sum, ts) => sum + ts.duration_seconds,
      0
    );

    const longestAbsenceSeconds =
      tabSwitches.length > 0
        ? Math.max(...tabSwitches.map((ts) => ts.duration_seconds))
        : 0;

    // Check if user switched away within 10 seconds of question being displayed
    const switchedAwayImmediately =
      tabSwitches.length > 0 &&
      new Date(tabSwitches[0].left_at).getTime() -
        new Date(questionDisplayedAtRef.current).getTime() <
        10000;

    return {
      tab_switch_count: tabSwitches.length,
      total_time_away_seconds: totalTimeAwaySeconds,
      tab_switches: tabSwitches,
      longest_absence_seconds: longestAbsenceSeconds,
      switched_away_immediately: switchedAwayImmediately,
      question_displayed_at: questionDisplayedAtRef.current,
    };
  };

  const resetTracking = () => {
    setTabSwitches([]);
    setLastTabLeaveTime(null);
    questionDisplayedAtRef.current = null;
    hasStartedRef.current = false;
  };

  return {
    tabSwitchingData: getTabSwitchingData(),
    resetTracking,
  };
};
