import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

interface LessonViewerProps {
  lesson: {
    id: string;
    title: string;
    type: string;
    content: string | null;
  };
  onComplete: () => void;
  onClose: () => void;
}

export default function LessonViewer({ lesson, onComplete, onClose }: LessonViewerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [projectResponse, setProjectResponse] = useState("");
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});

  // Parse content based on lesson type
  const parseContent = () => {
    if (!lesson.content) {
      return getDefaultContent();
    }
    
    try {
      return JSON.parse(lesson.content);
    } catch {
      return { text: lesson.content };
    }
  };

  const getDefaultContent = () => {
    switch (lesson.type) {
      case 'video':
        return {
          videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
          description: "Watch this video to learn about " + lesson.title
        };
      case 'reading':
        return {
          text: `# ${lesson.title}\n\nThis is a comprehensive reading lesson about ${lesson.title}. The content will help you understand the key concepts and principles.\n\n## Key Points\n- Important concept 1\n- Important concept 2\n- Important concept 3\n\n## Summary\nPractice these concepts to master ${lesson.title}.`
        };
      case 'quiz':
        return {
          questions: [
            {
              question: `What is the main concept of ${lesson.title}?`,
              options: ["Option A", "Option B", "Option C", "Option D"],
              correct: 0
            },
            {
              question: `How would you apply ${lesson.title}?`,
              options: ["Method 1", "Method 2", "Method 3", "Method 4"],
              correct: 1
            }
          ]
        };
      case 'exercise':
        return {
          instructions: `Complete this exercise to practice ${lesson.title}`,
          tasks: [
            "Task 1: Apply the concept",
            "Task 2: Solve a problem",
            "Task 3: Verify your solution"
          ]
        };
      case 'project':
        return {
          instructions: `Create a project that demonstrates your understanding of ${lesson.title}`,
          requirements: [
            "Requirement 1",
            "Requirement 2",
            "Requirement 3"
          ]
        };
      default:
        return { text: lesson.title };
    }
  };

  const content = parseContent();

  const renderVideoLesson = () => (
    <div className="space-y-4">
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        {content.videoUrl ? (
          <iframe
            width="100%"
            height="100%"
            src={content.videoUrl}
            title={lesson.title}
            className="rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <p className="text-muted-foreground">🎬 Video content for {lesson.title}</p>
        )}
      </div>
      {content.description && (
        <p className="text-secondary-foreground">{content.description}</p>
      )}
      <Button onClick={onComplete} className="w-full">Mark as Complete</Button>
    </div>
  );

  const renderReadingLesson = () => (
    <div className="space-y-4">
      <div className="prose prose-sm max-w-none">
        {content.text?.split('\n').map((paragraph: string, idx: number) => {
          if (paragraph.startsWith('# ')) {
            return <h1 key={idx} className="text-2xl font-bold text-secondary-foreground mb-4">{paragraph.slice(2)}</h1>;
          } else if (paragraph.startsWith('## ')) {
            return <h2 key={idx} className="text-xl font-semibold text-secondary-foreground mt-4 mb-2">{paragraph.slice(3)}</h2>;
          } else if (paragraph.startsWith('- ')) {
            return <li key={idx} className="text-secondary-foreground ml-4">{paragraph.slice(2)}</li>;
          } else if (paragraph.trim()) {
            return <p key={idx} className="text-secondary-foreground mb-2">{paragraph}</p>;
          }
          return null;
        })}
      </div>
      <Button onClick={onComplete} className="w-full">Mark as Complete</Button>
    </div>
  );

  const renderQuiz = () => {
    const questions = content.questions || [];
    const totalQuestions = questions.length;
    const isLastQuestion = currentStep === totalQuestions - 1;

    if (currentStep >= totalQuestions) {
      const correctAnswers = Object.entries(quizAnswers).filter(
        ([idx, answer]) => questions[parseInt(idx)].correct === parseInt(answer)
      ).length;
      
      return (
        <div className="space-y-4 text-center">
          <h3 className="text-2xl font-bold text-secondary-foreground">Quiz Complete! 🎉</h3>
          <p className="text-lg text-secondary-foreground">
            Score: {correctAnswers}/{totalQuestions}
          </p>
          <Progress value={(correctAnswers / totalQuestions) * 100} className="h-3" />
          <Button onClick={onComplete} className="w-full">Finish Quiz</Button>
        </div>
      );
    }

    const question = questions[currentStep];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm text-secondary-foreground/70">
            Question {currentStep + 1} of {totalQuestions}
          </span>
          <Progress value={((currentStep + 1) / totalQuestions) * 100} className="w-32 h-2" />
        </div>
        
        <h3 className="text-lg font-semibold text-secondary-foreground mb-4">
          {question.question}
        </h3>

        <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer}>
          <div className="space-y-3">
            {question.options.map((option: string, idx: number) => (
              <div key={idx} className="flex items-center space-x-2 p-3 rounded-lg border border-secondary-glow/30 hover:bg-secondary/10">
                <RadioGroupItem value={idx.toString()} id={`option-${idx}`} />
                <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer text-secondary-foreground">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>

        <Button
          onClick={() => {
            setQuizAnswers({ ...quizAnswers, [currentStep]: selectedAnswer });
            setSelectedAnswer("");
            setCurrentStep(currentStep + 1);
          }}
          disabled={!selectedAnswer}
          className="w-full"
        >
          {isLastQuestion ? "Submit Quiz" : "Next Question"}
        </Button>
      </div>
    );
  };

  const renderExercise = () => (
    <div className="space-y-4">
      <div className="bg-secondary/10 p-4 rounded-lg border border-secondary-glow/30">
        <h3 className="font-semibold text-secondary-foreground mb-2">Instructions</h3>
        <p className="text-secondary-foreground">{content.instructions}</p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-secondary-foreground">Tasks:</h4>
        {content.tasks?.map((task: string, idx: number) => (
          <div key={idx} className="flex items-start gap-2 p-3 bg-muted/50 rounded">
            <span className="text-secondary font-bold">{idx + 1}.</span>
            <span className="text-secondary-foreground">{task}</span>
          </div>
        ))}
      </div>

      <Button onClick={onComplete} className="w-full">Complete Exercise</Button>
    </div>
  );

  const renderProject = () => (
    <div className="space-y-4">
      <div className="bg-secondary/10 p-4 rounded-lg border border-secondary-glow/30">
        <h3 className="font-semibold text-secondary-foreground mb-2">Project Instructions</h3>
        <p className="text-secondary-foreground mb-4">{content.instructions}</p>
        
        <h4 className="font-semibold text-secondary-foreground mb-2">Requirements:</h4>
        <ul className="space-y-1">
          {content.requirements?.map((req: string, idx: number) => (
            <li key={idx} className="text-secondary-foreground flex items-start gap-2">
              <span className="text-secondary">✓</span>
              {req}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="project-response" className="text-secondary-foreground">
          Submit Your Project (Description or Link)
        </Label>
        <Textarea
          id="project-response"
          value={projectResponse}
          onChange={(e) => setProjectResponse(e.target.value)}
          placeholder="Describe your project or paste a link to your work..."
          className="min-h-32"
        />
      </div>

      <Button onClick={onComplete} disabled={!projectResponse.trim()} className="w-full">
        Submit Project
      </Button>
    </div>
  );

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video': return '🎬';
      case 'reading': return '📖';
      case 'quiz': return '🧠';
      case 'exercise': return '💪';
      case 'project': return '🚀';
      default: return '📚';
    }
  };

  return (
    <Card className="p-6 max-h-[80vh] overflow-y-auto bg-gradient-secondary border-2 border-secondary-glow">
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{getLessonIcon(lesson.type)}</span>
            <div>
              <h2 className="text-xl font-bold text-secondary-foreground">{lesson.title}</h2>
              <p className="text-sm text-secondary-foreground/70 capitalize">{lesson.type}</p>
            </div>
          </div>
          <Button variant="outline" onClick={onClose} size="sm">
            Close
          </Button>
        </div>

        {lesson.type === 'video' && renderVideoLesson()}
        {lesson.type === 'reading' && renderReadingLesson()}
        {lesson.type === 'quiz' && renderQuiz()}
        {lesson.type === 'exercise' && renderExercise()}
        {lesson.type === 'project' && renderProject()}
        {!['video', 'reading', 'quiz', 'exercise', 'project'].includes(lesson.type) && renderReadingLesson()}
      </div>
    </Card>
  );
}
