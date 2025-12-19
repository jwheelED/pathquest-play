import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      userId, 
      materialId, 
      materialTitle, 
      materialContent,
      examDate, 
      startDate, 
      goalType,
      daysAvailable 
    } = await req.json();

    console.log('Generating study plan for user:', userId);
    console.log('Days available:', daysAvailable);
    console.log('Goal type:', goalType);

    if (!userId || !materialId || !examDate || !startDate) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's org_id
    const { data: profileData } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .single();

    // Create the study plan
    const { data: studyPlan, error: planError } = await supabase
      .from('study_plans')
      .insert({
        user_id: userId,
        title: materialTitle,
        exam_date: examDate,
        start_date: startDate,
        material_ids: [materialId],
        goal_type: goalType,
        org_id: profileData?.org_id || null,
        status: 'active',
      })
      .select()
      .single();

    if (planError) {
      console.error('Error creating study plan:', planError);
      throw planError;
    }

    console.log('Study plan created:', studyPlan.id);

    // Use Lovable AI to generate the study plan tasks
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    let concepts: string[] = [];
    let dailyTasks: any[] = [];

    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You are an expert study planner. Create an optimal study schedule based on the material provided. 
                
Return a JSON object with this exact structure:
{
  "concepts": ["concept1", "concept2", ...],
  "dailyPlan": [
    {
      "dayOffset": 0,
      "tasks": [
        {
          "type": "learn|review|practice|quiz",
          "title": "Task title",
          "description": "What to do",
          "concepts": ["related concepts"]
        }
      ]
    }
  ]
}

Guidelines:
- First few days: Initial learning of all concepts
- Middle days: Practice and review with spaced repetition
- Last 2-3 days: Comprehensive review and mock questions
- For "mastery" goal: More repetition, deeper practice
- For "balanced" goal: Even distribution
- For "quick" goal: Focus on key concepts only
- Each day should have 2-4 tasks
- Tasks should build on each other`
              },
              {
                role: 'user',
                content: `Create a ${daysAvailable}-day study plan for:

Material: ${materialTitle}
Content: ${materialContent?.slice(0, 3000) || 'General study material'}
Goal: ${goalType}
Days until exam: ${daysAvailable}

Generate a complete daily study schedule.`
              }
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "create_study_plan",
                  description: "Create a structured study plan with daily tasks",
                  parameters: {
                    type: "object",
                    properties: {
                      concepts: {
                        type: "array",
                        items: { type: "string" },
                        description: "Key concepts to learn"
                      },
                      dailyPlan: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            dayOffset: { type: "number" },
                            tasks: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  type: { type: "string", enum: ["learn", "review", "practice", "quiz"] },
                                  title: { type: "string" },
                                  description: { type: "string" },
                                  concepts: { type: "array", items: { type: "string" } }
                                },
                                required: ["type", "title", "description"]
                              }
                            }
                          },
                          required: ["dayOffset", "tasks"]
                        }
                      }
                    },
                    required: ["concepts", "dailyPlan"]
                  }
                }
              }
            ],
            tool_choice: { type: "function", function: { name: "create_study_plan" } }
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          
          if (toolCall?.function?.arguments) {
            const planData = JSON.parse(toolCall.function.arguments);
            concepts = planData.concepts || [];
            
            // Convert AI plan to daily tasks
            for (const day of planData.dailyPlan || []) {
              const scheduledDate = new Date(startDate);
              scheduledDate.setDate(scheduledDate.getDate() + day.dayOffset);
              const dateStr = scheduledDate.toISOString().split('T')[0];
              
              for (let i = 0; i < (day.tasks || []).length; i++) {
                const task = day.tasks[i];
                dailyTasks.push({
                  plan_id: studyPlan.id,
                  scheduled_date: dateStr,
                  task_type: task.type,
                  title: task.title,
                  description: task.description,
                  content_reference: { concepts: task.concepts || [], materialId },
                  order_index: i,
                });
              }
            }
          }
        } else {
          console.error('AI response not ok:', await aiResponse.text());
        }
      } catch (aiError) {
        console.error('AI generation error:', aiError);
      }
    }

    // If AI didn't generate tasks, create a basic plan
    if (dailyTasks.length === 0) {
      console.log('Creating fallback study plan');
      
      // Simple algorithm: learn first third, practice middle third, review last third
      const learnDays = Math.ceil(daysAvailable / 3);
      const practiceDays = Math.ceil(daysAvailable / 3);
      const reviewDays = daysAvailable - learnDays - practiceDays;

      for (let i = 0; i < daysAvailable; i++) {
        const scheduledDate = new Date(startDate);
        scheduledDate.setDate(scheduledDate.getDate() + i);
        const dateStr = scheduledDate.toISOString().split('T')[0];

        let taskType: string;
        let taskTitle: string;
        let taskDesc: string;

        if (i < learnDays) {
          taskType = 'learn';
          taskTitle = `Learn: ${materialTitle} - Part ${i + 1}`;
          taskDesc = 'Read and understand the core concepts';
        } else if (i < learnDays + practiceDays) {
          taskType = 'practice';
          taskTitle = `Practice: ${materialTitle}`;
          taskDesc = 'Apply what you\'ve learned with practice questions';
        } else {
          taskType = 'review';
          taskTitle = `Review: ${materialTitle}`;
          taskDesc = 'Review and consolidate your knowledge';
        }

        // Add main task
        dailyTasks.push({
          plan_id: studyPlan.id,
          scheduled_date: dateStr,
          task_type: taskType,
          title: taskTitle,
          description: taskDesc,
          content_reference: { materialId },
          order_index: 0,
        });

        // Add a quiz on the last day
        if (i === daysAvailable - 1) {
          dailyTasks.push({
            plan_id: studyPlan.id,
            scheduled_date: dateStr,
            task_type: 'quiz',
            title: `Final Review Quiz: ${materialTitle}`,
            description: 'Test yourself on all concepts before the exam',
            content_reference: { materialId },
            order_index: 1,
          });
        }
      }
    }

    // Insert all daily tasks
    if (dailyTasks.length > 0) {
      const { error: tasksError } = await supabase
        .from('study_plan_daily_tasks')
        .insert(dailyTasks);

      if (tasksError) {
        console.error('Error inserting daily tasks:', tasksError);
        throw tasksError;
      }
      console.log(`Created ${dailyTasks.length} daily tasks`);
    }

    // Update study plan with concept count
    await supabase
      .from('study_plans')
      .update({ total_concepts: concepts.length || dailyTasks.length })
      .eq('id', studyPlan.id);

    // Also generate some personalized questions for practice
    try {
      await supabase.functions.invoke('generate-personalized-questions', {
        body: {
          materialId,
          userId,
          difficulty: goalType === 'mastery' ? 'hard' : goalType === 'quick' ? 'easy' : 'intermediate',
          questionCount: goalType === 'mastery' ? 10 : goalType === 'quick' ? 3 : 5
        }
      });
    } catch (qError) {
      console.error('Error generating questions:', qError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      planId: studyPlan.id,
      tasksCreated: dailyTasks.length,
      concepts: concepts.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in generate-study-plan:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
