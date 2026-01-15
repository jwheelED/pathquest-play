-- Create study_plans table for multi-day learning paths
CREATE TABLE public.study_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  exam_date DATE NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  material_ids UUID[] DEFAULT '{}',
  total_concepts INTEGER DEFAULT 0,
  concepts_mastered INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  goal_type TEXT DEFAULT 'balanced' CHECK (goal_type IN ('mastery', 'balanced', 'quick')),
  org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create study_plan_daily_tasks table for daily scheduled tasks
CREATE TABLE public.study_plan_daily_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('learn', 'review', 'practice', 'quiz')),
  title TEXT NOT NULL,
  description TEXT,
  content_reference JSONB DEFAULT '{}',
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_daily_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for study_plans
CREATE POLICY "Users can manage their own study plans"
ON public.study_plans
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Instructors can view student study plans"
ON public.study_plans
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM instructor_students
  WHERE instructor_students.instructor_id = auth.uid()
  AND instructor_students.student_id = study_plans.user_id
));

-- RLS policies for study_plan_daily_tasks
CREATE POLICY "Users can manage their own daily tasks"
ON public.study_plan_daily_tasks
FOR ALL
USING (EXISTS (
  SELECT 1 FROM study_plans
  WHERE study_plans.id = study_plan_daily_tasks.plan_id
  AND study_plans.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM study_plans
  WHERE study_plans.id = study_plan_daily_tasks.plan_id
  AND study_plans.user_id = auth.uid()
));

CREATE POLICY "Instructors can view student daily tasks"
ON public.study_plan_daily_tasks
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM study_plans sp
  JOIN instructor_students ist ON ist.student_id = sp.user_id
  WHERE sp.id = study_plan_daily_tasks.plan_id
  AND ist.instructor_id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX idx_study_plans_user_id ON public.study_plans(user_id);
CREATE INDEX idx_study_plans_status ON public.study_plans(status);
CREATE INDEX idx_study_plan_daily_tasks_plan_id ON public.study_plan_daily_tasks(plan_id);
CREATE INDEX idx_study_plan_daily_tasks_scheduled_date ON public.study_plan_daily_tasks(scheduled_date);
CREATE INDEX idx_study_plan_daily_tasks_completed ON public.study_plan_daily_tasks(completed);

-- Trigger for updated_at on study_plans
CREATE TRIGGER update_study_plans_updated_at
BEFORE UPDATE ON public.study_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();