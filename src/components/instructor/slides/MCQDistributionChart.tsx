import { cn } from '@/lib/utils';

export interface MCQDistribution {
  option: string;
  count: number;
  percentage: number;
  isCorrect?: boolean;
}

interface MCQDistributionChartProps {
  distribution: MCQDistribution[];
  isPoll: boolean;
  totalResponses: number;
  totalStudents: number;
}

export function MCQDistributionChart({
  distribution,
  isPoll,
  totalResponses,
  totalStudents,
}: MCQDistributionChartProps) {
  const maxCount = Math.max(...distribution.map(d => d.count), 1);

  return (
    <div className="space-y-2">
      {distribution.map((item) => (
        <div key={item.option} className="flex items-center gap-2">
          {/* Option label */}
          <span 
            className={cn(
              "w-5 h-5 flex items-center justify-center text-xs font-bold rounded",
              !isPoll && item.isCorrect 
                ? "bg-emerald-500/20 text-emerald-400" 
                : "bg-slate-700 text-slate-300"
            )}
          >
            {item.option}
          </span>
          
          {/* Bar container */}
          <div className="flex-1 h-4 bg-slate-700/50 rounded overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500 ease-out rounded",
                isPoll 
                  ? "bg-blue-500" 
                  : item.isCorrect 
                    ? "bg-emerald-500" 
                    : "bg-slate-500"
              )}
              style={{ 
                width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
              }}
            />
          </div>
          
          {/* Count and percentage */}
          <div className="w-16 text-right text-xs tabular-nums">
            <span className="text-slate-200 font-medium">{item.count}</span>
            <span className="text-slate-500 ml-1">
              ({Math.round(item.percentage)}%)
            </span>
          </div>
        </div>
      ))}
      
      {/* Total responses */}
      <div className="pt-2 mt-2 border-t border-slate-700/50 flex items-center justify-between text-xs">
        <span className="text-slate-400">
          {isPoll ? '📊 Poll Responses' : 'Responses'}
        </span>
        <span className="text-slate-300 font-medium tabular-nums">
          {totalResponses}/{totalStudents}
        </span>
      </div>
    </div>
  );
}
