import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

interface StudentChatCardProps {
  students: Array<{
    id: string;
    name: string;
  }>;
  currentUserId: string;
}

export default function StudentChatCard({ students, currentUserId }: StudentChatCardProps) {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Create anonymous mapping for students
  const anonymousStudents = students.map((student, index) => ({
    ...student,
    anonymousName: `Anonymous Student ${index + 1}`,
    anonymousInitials: `A${index + 1}`
  }));

  useEffect(() => {
    if (selectedStudent) {
      fetchMessages();
    }
  }, [selectedStudent]);
  
  useEffect(() => {
    // Set up real-time subscription for new messages
    if (!selectedStudent) return;
    
    const channel = supabase
      .channel('instructor-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `or(and(sender_id=eq.${selectedStudent},recipient_id=eq.${currentUserId}),and(sender_id=eq.${currentUserId},recipient_id=eq.${selectedStudent}))`
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedStudent, currentUserId]);

  const fetchMessages = async () => {
    if (!selectedStudent) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${selectedStudent}),and(sender_id.eq.${selectedStudent},recipient_id.eq.${currentUserId})`)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load messages");
      return;
    }

    setMessages(data || []);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedStudent) return;

    setLoading(true);
    const { error } = await supabase.from("messages").insert({
      sender_id: currentUserId,
      recipient_id: selectedStudent,
      content: newMessage.trim(),
    });

    if (error) {
      toast.error("Failed to send message");
    } else {
      setNewMessage("");
      fetchMessages();
    }
    setLoading(false);
  };

  const selectedStudentData = anonymousStudents.find(s => s.id === selectedStudent);

  return (
    <Card className="pixel-corners h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          Student Communication
        </CardTitle>
        <CardDescription>Chat with your students</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex gap-4 min-h-0">
        {/* Anonymous Student List */}
        <div className="w-1/3 border-r pr-4 space-y-2">
          <ScrollArea className="h-full">
            {anonymousStudents.map((student) => (
              <div
                key={student.id}
                onClick={() => setSelectedStudent(student.id)}
                className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedStudent === student.id
                    ? "bg-primary/20 border border-primary"
                    : "bg-accent/20 hover:bg-accent/40"
                } pixel-corners mb-2`}
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {student.anonymousInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm">{student.anonymousName}</span>
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedStudent ? (
            <>
              <div className="mb-3 pb-3 border-b">
                <h3 className="font-semibold">{selectedStudentData?.anonymousName}</h3>
                <p className="text-xs text-muted-foreground">Anonymous messaging enabled for student privacy</p>
              </div>
              <ScrollArea className="flex-1 mb-3">
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_id === currentUserId ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-lg pixel-corners ${
                          msg.sender_id === currentUserId
                            ? "bg-primary text-primary-foreground"
                            : "bg-accent"
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  className="retro-input"
                />
                <Button
                  onClick={sendMessage}
                  disabled={loading || !newMessage.trim()}
                  variant="retro"
                  size="icon"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a student to start chatting
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
