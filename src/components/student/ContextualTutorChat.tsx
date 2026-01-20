import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageCircle, Send, Clock, FileText, Sparkles, 
  ChevronDown, ChevronUp, X, Lightbulb, HelpCircle,
  Image, Download, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  evidence?: string;
  imageUrl?: string;
}

interface ContextualTutorChatProps {
  lectureId: string;
  pausePointId: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  timestampRange: { start: number; end: number };
  transcriptChunk?: string;
  slideText?: string;
  onClose: () => void;
}

const QUICK_ACTIONS = [
  { label: 'Simplify', prompt: 'Explain this concept in simpler terms, using easy words and examples.', icon: Sparkles },
  { label: '2 more practice questions', prompt: 'Give me 2 more practice questions about this concept to test my understanding.', icon: FileText },
];

const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function ContextualTutorChat({
  lectureId,
  pausePointId,
  question,
  userAnswer,
  correctAnswer,
  timestampRange,
  transcriptChunk,
  slideText,
  onClose,
}: ContextualTutorChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [diagramLimitReached, setDiagramLimitReached] = useState(false);
  const [allowGeneralKnowledge, setAllowGeneralKnowledge] = useState(false);
  const [showEvidence, setShowEvidence] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('contextual-tutor-chat', {
        body: {
          lectureId,
          pausePointId,
          question,
          userAnswer,
          correctAnswer,
          timestampRange,
          transcriptChunk,
          slideText,
          allowGeneralKnowledge,
          userMessage: messageText,
          conversationHistory: messages,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: data.timestampCitation,
        evidence: data.transcriptEvidence,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I had trouble processing your question. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDiagram = async () => {
    if (isGeneratingDiagram || diagramLimitReached) return;

    setIsGeneratingDiagram(true);
    
    // Add user message showing they requested a diagram
    const userMessage: Message = { role: 'user', content: '🎨 Generate a visual diagram for this concept' };
    setMessages(prev => [...prev, userMessage]);

    try {
      const { data, error } = await supabase.functions.invoke('generate-concept-diagram', {
        body: {
          concept: question,
          questionText: question,
          transcriptContext: transcriptChunk || slideText,
        },
      });

      if (error) {
        // Check if it's a limit error
        if (error.message?.includes('429') || error.message?.includes('limit')) {
          setDiagramLimitReached(true);
          toast({
            title: "Daily limit reached",
            description: "You've used your daily diagram. Try again tomorrow!",
            variant: "destructive",
          });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "You've already generated your diagram for today. Try again tomorrow! 📅",
          }]);
          return;
        }
        throw error;
      }

      if (data.limitReached) {
        setDiagramLimitReached(true);
        toast({
          title: "Daily limit reached",
          description: data.message || "You've used your daily diagram. Try again tomorrow!",
          variant: "destructive",
        });
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message || "You've already generated your diagram for today. Try again tomorrow! 📅",
        }]);
        return;
      }

      if (data.success && data.imageUrl) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.description || 'Here\'s a visual diagram to help you understand this concept:',
          imageUrl: data.imageUrl,
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        toast({
          title: "Diagram generated!",
          description: "Your visual diagram is ready.",
        });
      } else {
        throw new Error('No image returned');
      }
    } catch (error) {
      console.error('Diagram generation error:', error);
      toast({
        title: "Generation failed",
        description: "Could not generate diagram. Please try again.",
        variant: "destructive",
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I couldn\'t generate a diagram right now. Please try again later.',
      }]);
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const handleDownloadImage = (imageUrl: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `concept-diagram-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt);
  };

  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground rounded-full p-4 cursor-pointer shadow-lg hover:scale-105 transition-transform"
        onClick={() => setIsMinimized(false)}
      >
        <MessageCircle className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] bg-card border rounded-xl shadow-2xl flex flex-col max-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Ask About This</h3>
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(timestampRange.start)} – {formatTimestamp(timestampRange.end)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setIsMinimized(true)}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Context badges */}
      <div className="px-4 py-2 border-b bg-muted/10 flex flex-wrap gap-2">
        <Badge variant="secondary" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Context: {formatTimestamp(timestampRange.start)} – {formatTimestamp(timestampRange.end)}
        </Badge>
        {transcriptChunk && (
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Transcript loaded
          </Badge>
        )}
        {slideText && (
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Slide loaded
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <div className="p-3 rounded-full bg-muted/50 w-fit mx-auto">
              <HelpCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Ask me anything about this concept</p>
              <p className="text-xs text-muted-foreground mt-1">
                I'll help you understand using only the lecture content.
              </p>
            </div>
            
            {/* Quick actions - 2 buttons side by side */}
            <div className="flex gap-2 pt-2">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-9"
                  onClick={() => handleQuickAction(action.prompt)}
                >
                  <action.icon className="h-3.5 w-3.5 mr-1.5" />
                  {action.label}
                </Button>
              ))}
            </div>

            {/* Generate Diagram button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-9 border-dashed"
              onClick={handleGenerateDiagram}
              disabled={isGeneratingDiagram || diagramLimitReached}
            >
              {isGeneratingDiagram ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : diagramLimitReached ? (
                <>
                  <Image className="h-3.5 w-3.5 mr-1.5 opacity-50" />
                  Limit reached (1/day)
                </>
              ) : (
                <>
                  <Image className="h-3.5 w-3.5 mr-1.5" />
                  Generate Diagram
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex flex-col",
                  msg.role === 'user' ? 'items-end' : 'items-start'
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl p-3",
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  
                  {/* Image display */}
                  {msg.imageUrl && (
                    <div className="mt-3 space-y-2">
                      <img 
                        src={msg.imageUrl} 
                        alt="Generated concept diagram" 
                        className="rounded-lg w-full max-h-64 object-contain bg-white"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs h-8"
                        onClick={() => handleDownloadImage(msg.imageUrl!)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  )}
                  
                  {/* Timestamp citation */}
                  {msg.timestamp && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {msg.timestamp}
                      </Badge>
                    </div>
                  )}
                  
                  {/* Evidence toggle */}
                  {msg.evidence && (
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1 text-xs"
                        onClick={() => setShowEvidence(showEvidence === `${idx}` ? null : `${idx}`)}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        {showEvidence === `${idx}` ? 'Hide proof' : 'Show me proof'}
                        {showEvidence === `${idx}` ? (
                          <ChevronUp className="h-3 w-3 ml-1" />
                        ) : (
                          <ChevronDown className="h-3 w-3 ml-1" />
                        )}
                      </Button>
                      {showEvidence === `${idx}` && (
                        <div className="mt-2 p-2 rounded bg-background/50 text-xs text-muted-foreground italic">
                          "{msg.evidence}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {(isLoading || isGeneratingDiagram) && (
              <div className="flex items-start">
                <div className="bg-muted rounded-xl p-3">
                  {isGeneratingDiagram ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Generating diagram...</span>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick actions when in conversation */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/10">
          <div className="flex gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.label}
                variant="ghost"
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isLoading || isGeneratingDiagram}
              >
                <action.icon className="h-3 w-3 mr-1" />
                {action.label}
              </Button>
            ))}
            {/* Diagram button in conversation mode */}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2"
              onClick={handleGenerateDiagram}
              disabled={isLoading || isGeneratingDiagram || diagramLimitReached}
              title={diagramLimitReached ? "Daily limit reached" : "Generate diagram"}
            >
              {isGeneratingDiagram ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Image className={cn("h-3 w-3", diagramLimitReached && "opacity-50")} />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* General knowledge toggle */}
      <div className="px-4 py-2 border-t flex items-center justify-between bg-muted/10">
        <Label htmlFor="general-knowledge" className="text-xs text-muted-foreground flex items-center gap-1">
          <Lightbulb className="h-3 w-3" />
          Allow general knowledge
        </Label>
        <Switch
          id="general-knowledge"
          checked={allowGeneralKnowledge}
          onCheckedChange={setAllowGeneralKnowledge}
        />
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="min-h-[44px] max-h-24 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
          />
          <Button
            size="icon"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading || isGeneratingDiagram}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
