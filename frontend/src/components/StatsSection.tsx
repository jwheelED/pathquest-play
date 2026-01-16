import { AnimatedCounter } from './AnimatedCounter';
import { TrendingUp, Users, Award, Zap } from 'lucide-react';

const stats = [
  {
    icon: Users,
    value: 10000,
    suffix: '+',
    label: 'Active Students',
    color: 'text-primary'
  },
  {
    icon: Award,
    value: 50,
    suffix: '+',
    label: 'Universities',
    color: 'text-secondary'
  },
  {
    icon: Zap,
    value: 95,
    suffix: '%',
    label: 'Engagement Rate',
    color: 'text-achievement'
  },
  {
    icon: TrendingUp,
    value: 40,
    suffix: '%',
    label: 'Better Retention',
    color: 'text-energy'
  }
];

export const StatsSection = () => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="text-center p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-all duration-300 hover:-translate-y-1"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <Icon className={`w-8 h-8 ${stat.color} mx-auto mb-3`} />
            <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              <AnimatedCounter end={stat.value} suffix={stat.suffix} />
            </div>
            <div className="text-sm text-muted-foreground">{stat.label}</div>
          </div>
        );
      })}
    </div>
  );
};
