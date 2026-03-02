import { cn } from "@/lib/utils";
import { MessageSquareText } from "lucide-react";

interface TranscriptContextProps {
  transcript: string;
  questionText: string;
  className?: string;
}

export function TranscriptContext({ transcript, questionText, className }: TranscriptContextProps) {
  if (!transcript || transcript.trim() === '') return null;

  // Clean up the transcript text
  const cleanTranscript = transcript.trim();

  // Try to find and highlight relevant words from the question
  const highlightRelevantText = (text: string, question: string) => {
    // Extract key words from the question (words with 4+ characters, excluding common words)
    const stopWords = new Set(['what', 'when', 'where', 'which', 'that', 'this', 'will', 'would', 'could', 'should', 'have', 'been', 'with', 'from', 'your', 'about', 'their', 'there', 'here', 'does', 'following', 'many', 'much', 'some', 'into', 'inside', 'answer', 'question']);
    const questionWords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 4 && !stopWords.has(word));

    if (questionWords.length === 0) return text;

    // Create a regex pattern to match these words (case insensitive, word boundaries)
    const pattern = new RegExp(`(${questionWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

    // Split text by the pattern and rebuild with highlights
    const parts = text.split(pattern);
    
    return parts.map((part, index) => {
      const isMatch = questionWords.some(word => 
        part.toLowerCase() === word.toLowerCase()
      );
      
      if (isMatch) {
        return (
          <mark 
            key={index} 
            className="bg-secondary/40 text-secondary-foreground px-1 py-0.5 rounded font-semibold"
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <MessageSquareText className="h-3.5 w-3.5" />
        <span className="font-medium">From lecture transcript:</span>
      </div>
      <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-sm text-muted-foreground leading-relaxed">
        <p className="italic">
          "...{highlightRelevantText(cleanTranscript, questionText)}..."
        </p>
      </div>
    </div>
  );
}
