import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { Check } from "lucide-react";

interface Assignment {
  id: string;
  student_id: string;
  completed: boolean;
  quiz_responses: any;
  grade: number | null;
  created_at: string;
}

interface QuestionStats {
  total: number;
  completed: number;
  correct: number;
  percentage: number | null;
  avgResponseTime: number | null;
  isManualGradeShortAnswer: boolean;
  hasAIGrades?: boolean;
  avgAIGrade?: number | null;
}

interface QuestionAnalyticsChartProps {
  question: any;
  assignments: Assignment[];
  questionIndex: number;
  stats: QuestionStats;
}

const EMERALD = "#10b981";
const SLATE_LIGHT = "#e2e8f0";

export const QuestionAnalyticsChart = ({
  question,
  assignments,
  questionIndex,
  stats,
}: QuestionAnalyticsChartProps) => {
  const isMultipleChoice = question.type === "multiple_choice" && question.options;
  const isAutoGradedShortAnswer =
    question.type === "short_answer" && (stats.hasAIGrades || !stats.isManualGradeShortAnswer);

  // DEDUPLICATION: Keep only the latest submission per student
  const uniqueStudents = new Map<string, Assignment>();
  assignments.forEach((a) => {
    const existing = uniqueStudents.get(a.student_id);
    if (!existing || new Date(a.created_at) > new Date(existing.created_at)) {
      uniqueStudents.set(a.student_id, a);
    }
  });
  const deduplicatedAssignments = Array.from(uniqueStudents.values());

  const correctAnswerRaw = question.overriddenAnswer || question.correctAnswer;
  const correctAnswerLetter = (() => {
    if (!correctAnswerRaw) return "";
    const raw = String(correctAnswerRaw).trim();
    if (/^[A-Da-d]$/.test(raw)) return raw.toUpperCase();
    const prefixMatch = raw.match(/^([A-Da-d])[.):\s]/);
    if (prefixMatch) return prefixMatch[1].toUpperCase();
    if (question.options) {
      const idx = question.options.findIndex((opt: string) => {
        const optClean = opt.replace(/^[A-Da-d][.):\s]+/, "").trim();
        return optClean === raw || opt === raw;
      });
      if (idx >= 0) return String.fromCharCode(65 + idx);
    }
    return raw.toUpperCase();
  })();

  const answerDistribution = isMultipleChoice
    ? question.options?.map((opt: string, idx: number) => {
        const letter = String.fromCharCode(65 + idx);
        const count = deduplicatedAssignments.filter((a) => {
          if (!a.completed) return false;
          const content = (a as any).content;
          const assignmentQuestions = content?.questions || [];
          const studentQuestionIdx = assignmentQuestions.findIndex(
            (q: any) => q.question === question.question
          );
          if (studentQuestionIdx < 0) return false;
          const studentAnswer = a.quiz_responses?.[studentQuestionIdx.toString()];
          if (!studentAnswer) return false;
          const normalizedAnswer = (() => {
            const ans = String(studentAnswer).trim();
            if (/^[A-Da-d]$/.test(ans)) return ans.toUpperCase();
            const match = ans.match(/^([A-Da-d])[.):\s]/);
            if (match) return match[1].toUpperCase();
            return ans.toUpperCase();
          })();
          return normalizedAnswer === letter;
        }).length;
        return {
          option: letter,
          count,
          label: opt.length > 25 ? opt.substring(0, 25) + "…" : opt,
          isCorrect: letter === correctAnswerLetter,
        };
      })
    : [];

  // Grade distribution for auto-graded short answers
  const gradeDistribution = isAutoGradedShortAnswer
    ? [
        {
          range: "90–100",
          count: deduplicatedAssignments.filter(
            (a) => a.completed && a.grade != null && a.grade >= 90
          ).length,
          color: EMERALD,
        },
        {
          range: "70–89",
          count: deduplicatedAssignments.filter(
            (a) => a.completed && a.grade != null && a.grade >= 70 && a.grade < 90
          ).length,
          color: "#34d399",
        },
        {
          range: "50–69",
          count: deduplicatedAssignments.filter(
            (a) => a.completed && a.grade != null && a.grade >= 50 && a.grade < 70
          ).length,
          color: "#fbbf24",
        },
        {
          range: "0–49",
          count: deduplicatedAssignments.filter(
            (a) => a.completed && a.grade != null && a.grade < 50
          ).length,
          color: "#fca5a5",
        },
      ].filter((d) => d.count > 0)
    : [];

  // Two-segment donut: correct vs everything else
  const notCorrect = stats.total - stats.correct;
  const donutData = [
    { name: "Correct", value: stats.correct, color: EMERALD },
    { name: "Not Answered", value: notCorrect, color: SLATE_LIGHT },
  ].filter((d) => d.value > 0);

  // Y-axis max for bar chart — ceiling whole number
  const barMax = answerDistribution.length > 0
    ? Math.max(...answerDistribution.map((d: { count: number }) => d.count), 1)
    : 1;

  return (
    <div className="my-4 border border-border/50 rounded-xl p-5 bg-white shadow-sm space-y-6">
      <p className="text-sm font-semibold text-foreground">Visual Analytics</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Answer Distribution Bar Chart */}
        {isMultipleChoice && answerDistribution.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Answer Distribution
            </p>
            <div className="w-full overflow-hidden">
              <BarChart
                width={260}
                height={200}
                data={answerDistribution}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#f1f5f9"
                  strokeWidth={1}
                />
                <XAxis
                  dataKey="option"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, Math.ceil(barMax)]}
                  ticks={Array.from({ length: Math.ceil(barMax) + 1 }, (_, i) => i)}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-border/50 bg-white px-3 py-2 shadow-md text-xs space-y-0.5">
                          <p className="font-semibold text-foreground">
                            Option {d.option}{d.isCorrect ? " ✓" : ""}
                          </p>
                          <p className="text-muted-foreground">{d.label}</p>
                          <p className="font-medium">
                            {d.count} student{d.count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {answerDistribution.map((entry: { isCorrect: boolean }, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isCorrect ? EMERALD : SLATE_LIGHT}
                    />
                  ))}
                </Bar>
              </BarChart>
            </div>
          </div>
        )}

        {/* Grade Distribution (short answer) */}
        {isAutoGradedShortAnswer && gradeDistribution.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Grade Distribution
            </p>
            <div className="space-y-2 pt-1">
              {gradeDistribution.map((d) => {
                const total = deduplicatedAssignments.filter((a) => a.completed).length;
                const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                return (
                  <div key={d.range} className="flex items-center gap-2 text-xs">
                    <span className="w-14 text-muted-foreground shrink-0">{d.range}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: d.color }}
                      />
                    </div>
                    <span className="w-8 text-right text-muted-foreground">{d.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Performance Overview — two-segment donut */}
        {donutData.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Performance Overview
            </p>
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <PieChart width={160} height={160}>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0];
                        const pct = stats.total > 0
                          ? ((Number(d.value) / stats.total) * 100).toFixed(0)
                          : "0";
                        return (
                          <div className="rounded-lg border border-border/50 bg-white px-3 py-2 shadow-md text-xs space-y-0.5">
                            <p className="font-semibold text-foreground">{d.name}</p>
                            <p className="text-muted-foreground">
                              {d.value} student{Number(d.value) !== 1 ? "s" : ""} ({pct}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold text-foreground leading-none">
                    {stats.correct}/{stats.total}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">correct</span>
                </div>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EMERALD }} />
                  <span className="text-foreground font-medium">Correct</span>
                  <span className="text-muted-foreground">({stats.correct})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SLATE_LIGHT }} />
                  <span className="text-foreground font-medium">Not Answered</span>
                  <span className="text-muted-foreground">({stats.total - stats.correct})</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
