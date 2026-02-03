// Types for Question Bank feature

export type QuestionType = 'coding' | 'coding_simple' | 'multiple_choice' | 'short_answer';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CodingExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCase {
  input: any[];
  expected: any;
}

export interface CodingQuestionContent {
  question: string;
  title: string;
  language: string;
  difficulty: string;
  functionSignature?: string;
  constraints: string[];
  examples: CodingExample[];
  hints: string[];
  starterCode: string;
  testCases: TestCase[];
}

export interface MCQQuestionContent {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface ShortAnswerQuestionContent {
  question: string;
  expectedAnswer: string;
  gradingNotes?: string;
}

export type QuestionContent = CodingQuestionContent | MCQQuestionContent | ShortAnswerQuestionContent;

export interface QuestionBankItem {
  id: string;
  instructor_id: string;
  course_id: string | null;
  org_id: string | null;
  title: string;
  question_type: QuestionType;
  question_content: QuestionContent;
  difficulty: Difficulty | null;
  tags: string[] | null;
  times_used: number | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionFormData {
  title: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  tags: string[];
  question_content: QuestionContent;
}

// Type guards
export function isCodingContent(content: QuestionContent): content is CodingQuestionContent {
  return 'starterCode' in content || 'functionSignature' in content || 'testCases' in content;
}

export function isMCQContent(content: QuestionContent): content is MCQQuestionContent {
  return 'options' in content && 'correctAnswer' in content;
}

export function isShortAnswerContent(content: QuestionContent): content is ShortAnswerQuestionContent {
  return 'expectedAnswer' in content && !('options' in content);
}
