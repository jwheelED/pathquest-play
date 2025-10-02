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
  recipient_id: string;
  content: string;
  created_at: string;
  read: boolean;
}

interface Instructor {
  id: string;
  full_name: string;
}

interface InstructorChatCardProps {
  userId: string;
}

export default function InstructorChatCard({ userId }: InstructorChatCardProps) {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selectedInstructor, setSelectedInstructor] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInstructors();
  }, [userId]);

  useEffect(() => {
    if (selectedInstructor) {
      fetchMessages();
      
      // Set up realtime subscription for new messages
      const channel = supabase
        .channel('instructor-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `recipient_id=eq.${userId}`
          },
          (payload) => {
            if (payload.new.sender_id === selectedInstructor) {
              setMessages(prev => [...prev, payload.new as Message]);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedInstructor, userId]);

  const fetchInstructors = async () => {
    const { data: connections, error: connectionsError } = await supabase
      .from("instructor_students")
      .select("instructor_id")
      .eq("student_id", userId);

    if (connectionsError) {
      console.error("Error fetching instructors:", connectionsError);
      return;
    }

    if (!connections || connections.length === 0) {
      return;
    }

    const instructorIds = connections.map(c => c.instructor_id);
    const { data: instructorData, error: instructorError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", instructorIds);

    if (instructorError) {
      console.error("Error fetching instructor profiles:", instructorError);
      return;
    }

    setInstructors(instructorData || []);
    
    // Auto-select first instructor if available
    if (instructorData && instructorData.length > 0 && !selectedInstructor) {
      setSelectedInstructor(instructorData[0].id);
    }
  };

  const fetchMessages = async () => {
    if (!selectedInstructor) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${selectedInstructor}),and(sender_id.eq.${selectedInstructor},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load messages");
      return;
    }

    setMessages(data || []);

    // Mark unread messages as read
    const unreadMessages = data?.filter(
      msg => msg.recipient_id === userId && !msg.read
    ) || [];
    
    if (unreadMessages.length > 0) {
      await supabase
        .from("messages")
        .update({ read: true })
        .in("id", unreadMessages.map(m => m.id));
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedInstructor) return;

    setLoading(true);
    const { error } = await supabase.from("messages").insert({
      sender_id: userId,
      recipient_id: selectedInstructor,
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

  const selectedInstructorData = instructors.find(i => i.id === selectedInstructor);

  if (instructors.length === 0) {
    return (
      <Card className="p-6 border-2 border-primary-glow bg-gradient-to-br from-card to-primary/5">
        <div className="text-center text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No instructors connected yet</p>
          <p className="text-sm mt-2">Join a class to start messaging instructors</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-2 border-primary-glow bg-gradient-to-br from-card to-primary/5">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          💬 Instructor Messages
        </CardTitle>
        <CardDescription>Chat with your instructors</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="flex gap-4 h-[400px]">
          {/* Instructor List */}
          {instructors.length > 1 && (
            <div className="w-1/3 border-r pr-4 space-y-2">
              <ScrollArea className="h-full">
                {instructors.map((instructor) => (
                  <div
                    key={instructor.id}
                    onClick={() => setSelectedInstructor(instructor.id)}
                    className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedInstructor === instructor.id
                        ? "bg-primary/20 border border-primary"
                        : "bg-accent/20 hover:bg-accent/40"
                    } mb-2`}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {instructor.full_name?.split(' ').map(n => n[0]).join('') || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{instructor.full_name || 'Instructor'}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          )}

          {/* Chat Area */}
          <div className={`${instructors.length > 1 ? 'flex-1' : 'w-full'} flex flex-col`}>
            {selectedInstructor ? (
              <>
                <div className="mb-3 pb-3 border-b">
                  <h3 className="font-semibold">{selectedInstructorData?.full_name || 'Instructor'}</h3>
                </div>
                <ScrollArea className="flex-1 mb-3 pr-4">
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_id === userId ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] p-3 rounded-lg ${
                            msg.sender_id === userId
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
                Select an instructor to start chatting
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
