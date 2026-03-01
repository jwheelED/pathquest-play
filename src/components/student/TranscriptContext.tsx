import { useState } from "react";
import { ChevronDown, ChevronUp, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TranscriptContextProps {
  transcript: string;
  questionText: string;
  className?: string;
}

export function TranscriptContext({ transcript, questionText, className }: TranscriptContextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!transcript || transcript.trim() === '') return null;

  // Clean up the transcript text
  const cleanTranscript = transcript.trim();

  // Try to find and highlight relevant words from the question
  const highlightRelevantText = (text: string, question: string) => {
    // Extract key words from the question (words with 4+ characters, excluding common words)
    const stopWords = new Set(['what', 'when', 'where', 'which', 'that', 'this', 'will', 'would', 'could', 'should', 'have', 'been', 'with', 'from', 'your', 'about', 'their', 'there', 'here', 'does', 'following']);
    const questionWords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 4 && !stopWords.has(word));

    if (questionWords.length === 0) return text;

    // Create a regex pattern to match these words
    const pattern = new RegExp(`\\b(${questionWords.join('|')})\\b`, 'gi');

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
            className="bg-secondary/30 text-secondary-foreground px-0.5 rounded font-medium"
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 h-8 px-3"
      >
        <span className="flex items-center gap-2">
          <MessageSquareText className="h-3.5 w-3.5" />
          <span>From lecture transcript</span>
        </span>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </Button>
      
      {isExpanded && (
        <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-border/50 text-sm text-muted-foreground leading-relaxed">
          <p className="italic">
            "...{highlightRelevantText(cleanTranscript, questionText)}..."
          </p>
        </div>
      )}
    </div>
  );
}
