import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

interface Assignment {
  id: string;
  student_id: string;
  completed: boolean;
  quiz_responses: any;
  grade: number | null;
}

interface QuestionStats {
  total: number;
  completed: number;
  correct: number;
  percentage: number | null;
  avgResponseTime: number | null;
  isManualGradeShortAnswer: boolean;
}

interface QuestionAnalyticsChartProps {
  question: any;
  assignments: Assignment[];
  questionIndex: number;
  stats: QuestionStats;
}

export const QuestionAnalyticsChart = ({
  question,
  assignments,
  questionIndex,
  stats,
}: QuestionAnalyticsChartProps) => {
  const isMultipleChoice = question.type === "multiple_choice" && question.options;
  const isAutoGradedShortAnswer = question.type === "short_answer" && !stats.isManualGradeShortAnswer;

  // Calculate answer distribution for multiple choice
  const answerDistribution = isMultipleChoice
    ? question.options?.map((opt: string, idx: number) => {
        const letter = String.fromCharCode(65 + idx);
        const count = assignments.filter(
          (a) => a.completed && a.quiz_responses?.[questionIndex.toString()] === letter
        ).length;
        const isCorrect = letter === (question.overriddenAnswer || question.correctAnswer);

        return {
          option: letter,
          count: count,
          label: opt.length > 25 ? opt.substring(0, 25) + "..." : opt,
          isCorrect: isCorrect,
        };
      })
    : [];

  // Calculate performance data
  const performanceData = [
    {
      name: "Correct",
      value: stats.correct,
      fill: "hsl(var(--success))",
    },
    {
      name: "Incorrect",
      value: stats.completed - stats.correct,
      fill: "hsl(var(--destructive))",
    },
    {
      name: "Not Answered",
      value: stats.total - stats.completed,
      fill: "hsl(var(--muted))",
    },
  ].filter((d) => d.value > 0);

  // Calculate grade distribution for auto-graded short answers
  const gradeDistribution = isAutoGradedShortAnswer
    ? [
        {
          range: "90-100 (Excellent)",
          count: assignments.filter((a) => a.completed && a.grade && a.grade >= 90).length,
          fill: "hsl(var(--success))",
        },
        {
          range: "70-89 (Good)",
          count: assignments.filter((a) => a.completed && a.grade && a.grade >= 70 && a.grade < 90)
            .length,
          fill: "hsl(var(--primary))",
        },
        {
          range: "50-69 (Pass)",
          count: assignments.filter((a) => a.completed && a.grade && a.grade >= 50 && a.grade < 70)
            .length,
          fill: "hsl(var(--warning))",
        },
        {
          range: "0-49 (Needs Work)",
          count: assignments.filter((a) => a.completed && a.grade && a.grade < 50).length,
          fill: "hsl(var(--destructive))",
        },
      ].filter((d) => d.count > 0)
    : [];

  const chartConfig = {
    count: {
      label: "Students",
      color: "hsl(var(--primary))",
    },
    value: {
      label: "Count",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <div className="my-4 border rounded-lg p-4 bg-muted/20">
      <p className="text-sm font-medium mb-3">📊 Visual Analytics</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Answer Distribution Chart (Multiple Choice) */}
        {isMultipleChoice && answerDistribution.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Answer Distribution</p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={answerDistribution}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="option" />
                <YAxis />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold">
                              Option {data.option} {data.isCorrect && "✓"}
                            </span>
                            <span className="text-xs text-muted-foreground">{data.label}</span>
                            <span className="text-xs font-medium">
                              {data.count} student{data.count !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {answerDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isCorrect ? "hsl(var(--success))" : "hsl(var(--primary))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Grade Distribution Chart (Auto-Graded Short Answer) */}
        {isAutoGradedShortAnswer && gradeDistribution.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Grade Distribution</p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={gradeDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="range" width={120} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {gradeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Performance Overview Pie Chart */}
        {performanceData.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Performance Overview</p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <PieChart>
                <Pie
                  data={performanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {performanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0];
                      const percentage = stats.total > 0 
                        ? ((data.value as number / stats.total) * 100).toFixed(1)
                        : "0";
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold">{data.name}</span>
                            <span className="text-xs font-medium">
                              {data.value} student{data.value !== 1 ? "s" : ""} ({percentage}%)
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ChartContainer>
          </div>
        )}
      </div>
    </div>
  );
};
