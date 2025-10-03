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
    const title = lesson.title.toLowerCase();
    
    switch (lesson.type) {
      case 'video':
        return {
          videoUrl: "",
          description: `This video lesson covers ${lesson.title}. Watch carefully and take notes on the key concepts presented. You can pause and rewind as needed to fully understand the material.`
        };
      case 'reading':
        // Generate educational content based on common topics
        if (title.includes('fraction') || title.includes('basic arithmetic')) {
          return {
            text: `# ${lesson.title}\n\n## Introduction\nFractions represent parts of a whole. Understanding fractions is essential for algebra, geometry, and real-world applications like cooking and measurements.\n\n## What is a Fraction?\nA fraction consists of two parts:\n- **Numerator** (top number): Shows how many parts you have\n- **Denominator** (bottom number): Shows how many equal parts make up the whole\n\nExample: In 3/4, we have 3 parts out of 4 total parts.\n\n## Types of Fractions\n- **Proper fractions**: Numerator < Denominator (e.g., 2/5)\n- **Improper fractions**: Numerator ≥ Denominator (e.g., 7/4)\n- **Mixed numbers**: Whole number + fraction (e.g., 1 3/4)\n\n## Adding Fractions\nTo add fractions with the same denominator:\n1. Keep the denominator the same\n2. Add the numerators\n3. Simplify if possible\n\nExample: 1/4 + 2/4 = 3/4\n\n## Practice Application\nFractions appear everywhere: splitting a pizza, measuring ingredients, calculating discounts, and understanding percentages. Mastering fractions opens doors to advanced mathematics!\n\n## Key Takeaway\nAlways remember: the denominator tells you the size of each piece, while the numerator tells you how many pieces you have.`
          };
        } else if (title.includes('algebra') || title.includes('equation') || title.includes('variable')) {
          return {
            text: `# ${lesson.title}\n\n## What is Algebra?\nAlgebra is the branch of mathematics that uses letters (variables) to represent unknown numbers. It's like solving puzzles where you find the missing piece!\n\n## Variables and Constants\n- **Variables**: Letters that represent unknown values (x, y, z)\n- **Constants**: Known fixed numbers (5, -3, 100)\n\n## Basic Operations\nAlgebra follows the same rules as arithmetic:\n- Addition: x + 3\n- Subtraction: x - 7\n- Multiplication: 4x (means 4 × x)\n- Division: x/2\n\n## Solving Simple Equations\nAn equation is like a balanced scale. Whatever you do to one side, you must do to the other!\n\nExample: Solve x + 5 = 12\n1. Subtract 5 from both sides\n2. x + 5 - 5 = 12 - 5\n3. x = 7\n\n## Order of Operations (PEMDAS)\n1. Parentheses\n2. Exponents\n3. Multiplication and Division (left to right)\n4. Addition and Subtraction (left to right)\n\n## Real-World Applications\nAlgebra helps us:\n- Calculate prices and discounts\n- Determine travel time and distance\n- Plan budgets and savings\n- Solve engineering and science problems\n\n## Remember\nAlgebra is a powerful tool that turns word problems into mathematical equations you can solve step by step!`
          };
        } else if (title.includes('geometry') || title.includes('shape') || title.includes('angle')) {
          return {
            text: `# ${lesson.title}\n\n## Understanding Geometry\nGeometry is the study of shapes, sizes, and the properties of space. It helps us understand the world around us, from architecture to nature!\n\n## Basic Shapes and Properties\n**Triangles**:\n- Three sides and three angles\n- Sum of angles always equals 180°\n- Types: Equilateral, Isosceles, Scalene\n\n**Quadrilaterals**:\n- Four-sided shapes\n- Examples: Square, Rectangle, Trapezoid, Rhombus\n- Sum of angles equals 360°\n\n**Circles**:\n- All points equidistant from center\n- Key terms: Radius, Diameter, Circumference\n- Formula: Area = πr², Circumference = 2πr\n\n## Angles\n- **Acute**: Less than 90°\n- **Right**: Exactly 90°\n- **Obtuse**: Between 90° and 180°\n- **Straight**: Exactly 180°\n\n## Perimeter and Area\n**Perimeter**: Distance around the outside\n**Area**: Space inside the shape\n\nRectangle:\n- Perimeter = 2(length + width)\n- Area = length × width\n\nTriangle:\n- Area = (base × height) / 2\n\n## Real-World Applications\nGeometry is everywhere:\n- Architecture and construction\n- Art and design\n- Navigation and maps\n- Computer graphics and animation\n\n## Key Insight\nGeometry helps us measure, design, and understand the physical world with precision!`
          };
        } else if (title.includes('science') || title.includes('physics') || title.includes('chemistry')) {
          return {
            text: `# ${lesson.title}\n\n## Introduction to Science\nScience is the systematic study of the natural world through observation and experimentation. It helps us understand how things work and why things happen.\n\n## The Scientific Method\n1. **Observation**: Notice something interesting\n2. **Question**: Ask what, why, or how\n3. **Hypothesis**: Make an educated guess\n4. **Experiment**: Test your hypothesis\n5. **Analysis**: Examine the results\n6. **Conclusion**: Determine if hypothesis was correct\n\n## Basic Concepts\n**Matter**: Anything that has mass and takes up space\n- Solids: Fixed shape and volume\n- Liquids: Fixed volume, takes shape of container\n- Gases: No fixed shape or volume\n\n**Energy**: The ability to do work\n- Kinetic: Energy of motion\n- Potential: Stored energy\n\n**Forces**: Pushes or pulls that can change motion\n- Gravity: Pulls objects toward each other\n- Friction: Opposes motion between surfaces\n\n## Scientific Thinking\nScientists:\n- Ask questions\n- Make careful observations\n- Design controlled experiments\n- Record accurate data\n- Draw evidence-based conclusions\n\n## Why Science Matters\nScience helps us:\n- Develop new technologies\n- Solve environmental problems\n- Improve health and medicine\n- Understand our universe\n\n## Remember\nScience is not about memorizing facts—it's about asking questions and discovering answers through careful investigation!`
          };
        } else {
          // Generic educational content
          return {
            text: `# ${lesson.title}\n\n## Introduction\nThis lesson covers fundamental concepts in ${lesson.title}. Understanding these principles will help you build a strong foundation for more advanced topics.\n\n## Core Concepts\n\n### Concept 1: Fundamentals\nEvery topic begins with understanding the basics. Take time to grasp the foundational ideas before moving to advanced material. These fundamentals will be used repeatedly as you progress.\n\n### Concept 2: Application\nLearning isn't just about theory—it's about applying what you know to solve real problems. Think about how these concepts connect to situations in everyday life or other subjects you're studying.\n\n### Concept 3: Problem-Solving Approach\nWhen facing challenges:\n1. Break the problem into smaller parts\n2. Identify what you know and what you need to find\n3. Choose appropriate strategies and tools\n4. Work through step by step\n5. Check your answer for reasonableness\n\n## Practice Strategies\n- **Regular review**: Spend time each day reviewing concepts\n- **Active learning**: Don't just read—work through examples\n- **Ask questions**: Seek clarification when confused\n- **Teach others**: Explaining concepts reinforces your understanding\n- **Make connections**: Link new ideas to what you already know\n\n## Common Mistakes to Avoid\n- Rushing through without understanding\n- Skipping practice problems\n- Not asking for help when stuck\n- Memorizing without comprehension\n\n## Key Takeaways\nMastery comes from:\n- Understanding core principles\n- Regular practice and application\n- Learning from mistakes\n- Building on previous knowledge\n\n## Next Steps\nAfter completing this lesson, apply what you've learned through practice problems and real-world applications. The more you use these concepts, the more natural they'll become!`
          };
        }
      case 'quiz':
        if (title.includes('fraction')) {
          return {
            questions: [
              {
                question: "What does the denominator of a fraction represent?",
                options: [
                  "The number of parts you have",
                  "The total number of equal parts in the whole",
                  "The sum of the numerator",
                  "The difference between parts"
                ],
                correct: 1
              },
              {
                question: "Which fraction is equivalent to 1/2?",
                options: ["1/4", "2/3", "3/6", "4/5"],
                correct: 2
              },
              {
                question: "What is 1/4 + 1/4?",
                options: ["2/8", "1/2", "2/4", "Both B and C are correct"],
                correct: 3
              },
              {
                question: "Which type of fraction has a numerator larger than the denominator?",
                options: ["Proper fraction", "Improper fraction", "Mixed number", "Unit fraction"],
                correct: 1
              }
            ]
          };
        } else if (title.includes('algebra')) {
          return {
            questions: [
              {
                question: "In the expression 3x + 5, what is 'x' called?",
                options: ["Constant", "Variable", "Coefficient", "Equation"],
                correct: 1
              },
              {
                question: "If x + 7 = 15, what is x?",
                options: ["7", "8", "15", "22"],
                correct: 1
              },
              {
                question: "What does PEMDAS stand for?",
                options: [
                  "Please Execute My Data Analysis System",
                  "Parentheses, Exponents, Multiplication, Division, Addition, Subtraction",
                  "Perfect Equations Make Dramatic Algebraic Solutions",
                  "Plus, Equals, Minus, Divide, Add, Subtract"
                ],
                correct: 1
              },
              {
                question: "What is the coefficient in the term 5y?",
                options: ["y", "5", "5y", "1"],
                correct: 1
              }
            ]
          };
        } else if (title.includes('geometry')) {
          return {
            questions: [
              {
                question: "What is the sum of angles in a triangle?",
                options: ["90 degrees", "180 degrees", "270 degrees", "360 degrees"],
                correct: 1
              },
              {
                question: "Which shape has all sides equal and all angles 90 degrees?",
                options: ["Rectangle", "Rhombus", "Square", "Trapezoid"],
                correct: 2
              },
              {
                question: "What is the formula for the area of a rectangle?",
                options: ["length + width", "length × width", "2(length + width)", "length ÷ width"],
                correct: 1
              },
              {
                question: "An angle measuring exactly 90 degrees is called?",
                options: ["Acute angle", "Right angle", "Obtuse angle", "Straight angle"],
                correct: 1
              }
            ]
          };
        } else {
          return {
            questions: [
              {
                question: `What is a key principle in ${lesson.title}?`,
                options: [
                  "Understanding the foundational concepts",
                  "Memorizing formulas without context",
                  "Skipping practice problems",
                  "Avoiding questions"
                ],
                correct: 0
              },
              {
                question: "What is the best approach to learning new material?",
                options: [
                  "Rush through to finish quickly",
                  "Break it into smaller parts and practice regularly",
                  "Only study the night before a test",
                  "Avoid asking for help"
                ],
                correct: 1
              },
              {
                question: `How can you apply ${lesson.title} to real-world situations?`,
                options: [
                  "It has no real-world applications",
                  "Only in academic settings",
                  "By connecting concepts to everyday problems",
                  "Only professional mathematicians use it"
                ],
                correct: 2
              }
            ]
          };
        }
      case 'exercise':
        if (title.includes('fraction')) {
          return {
            instructions: "Practice solving fraction problems to build your skills. Show your work for each problem.",
            tasks: [
              "Simplify the fraction: 6/8 (divide both numerator and denominator by their greatest common factor)",
              "Add these fractions: 2/5 + 1/5 (remember to keep the same denominator)",
              "Convert the improper fraction 9/4 to a mixed number",
              "Compare these fractions using <, >, or =: 3/4 ___ 2/3",
              "Real-world problem: If you eat 2/8 of a pizza and your friend eats 3/8, how much pizza did you eat together?"
            ]
          };
        } else if (title.includes('algebra')) {
          return {
            instructions: "Solve these algebra problems step by step. Remember to show your work and check your answers.",
            tasks: [
              "Solve for x: x + 12 = 20 (subtract 12 from both sides)",
              "Simplify: 3x + 5x (combine like terms)",
              "Solve for y: 2y = 18 (divide both sides by 2)",
              "Evaluate: 4(3 + 2) - 5 (use order of operations)",
              "Word problem: Sarah has $15 and wants to buy books that cost $3 each. Write an equation to find how many books she can buy."
            ]
          };
        } else if (title.includes('geometry')) {
          return {
            instructions: "Complete these geometry exercises. Draw diagrams where helpful and label all measurements.",
            tasks: [
              "Find the perimeter of a rectangle with length 8 cm and width 5 cm",
              "Calculate the area of a triangle with base 10 m and height 6 m",
              "A triangle has angles of 60° and 70°. Find the third angle.",
              "Find the circumference of a circle with radius 7 cm (use π ≈ 3.14)",
              "Real-world: You're fencing a rectangular garden that's 12 ft by 8 ft. How much fencing do you need?"
            ]
          };
        } else {
          return {
            instructions: `Practice applying the concepts from ${lesson.title}. Work through each task carefully.`,
            tasks: [
              "Review the key concepts and write them in your own words",
              "Complete three practice problems related to the topic",
              "Identify a real-world situation where you could apply this knowledge",
              "Create your own example problem and solve it",
              "Reflect: What was the most challenging part? What strategies helped you succeed?"
            ]
          };
        }
      case 'project':
        if (title.includes('fraction')) {
          return {
            instructions: "Create a visual fraction project that demonstrates your understanding. This can be a poster, presentation, or hands-on model.",
            requirements: [
              "Show at least 5 different fractions visually (use circles, rectangles, or real objects)",
              "Include examples of adding and subtracting fractions",
              "Demonstrate the difference between proper fractions, improper fractions, and mixed numbers",
              "Create a real-world scenario where fractions are used (cooking, sharing, measuring, etc.)",
              "Include a written explanation of what you learned about fractions"
            ]
          };
        } else if (title.includes('algebra')) {
          return {
            instructions: "Design an algebra application project that shows how algebra solves real problems.",
            requirements: [
              "Choose a real-world scenario (shopping, travel, budgeting, etc.)",
              "Write at least 3 word problems based on your scenario",
              "Solve each problem using algebraic equations, showing all steps",
              "Create a visual representation (graph, chart, or diagram) of at least one solution",
              "Write a reflection explaining how algebra made solving these problems easier"
            ]
          };
        } else if (title.includes('geometry')) {
          return {
            instructions: "Create a geometry project that explores shapes and measurements in the real world.",
            requirements: [
              "Find or create 5 different geometric shapes in real life (take photos or draw them)",
              "Calculate the perimeter and area of at least 3 shapes",
              "Identify angles and classify them (acute, right, obtuse)",
              "Design a floor plan for a dream room using geometric shapes with measurements",
              "Explain how geometry is used in architecture, art, or nature"
            ]
          };
        } else {
          return {
            instructions: `Create a comprehensive project demonstrating your mastery of ${lesson.title}.`,
            requirements: [
              "Research and present key concepts in an organized format",
              "Include at least 3 examples with detailed solutions",
              "Create a visual component (poster, slides, or diagram)",
              "Show real-world applications of the concepts",
              "Write a summary of what you learned and how you'll use this knowledge"
            ]
          };
        }
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
