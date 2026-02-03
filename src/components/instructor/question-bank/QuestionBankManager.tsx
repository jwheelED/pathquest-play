import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Library, PlusCircle } from "lucide-react";
import { QuestionBankLibrary } from "./QuestionBankLibrary";
import { QuestionBankEditor } from "./QuestionBankEditor";
import { QuestionBankItem, QuestionFormData } from "./types";

interface QuestionBankManagerProps {
  courseId?: string;
  professorType?: 'stem' | 'humanities' | 'medical' | null;
  onSendQuestion?: (question: QuestionBankItem) => void;
  isLiveSession?: boolean;
}

export function QuestionBankManager({ 
  courseId, 
  professorType,
  onSendQuestion,
  isLiveSession = false 
}: QuestionBankManagerProps) {
  const [activeTab, setActiveTab] = useState<"library" | "create">("library");
  const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = (question: QuestionBankItem) => {
    setEditingQuestion(question);
    setActiveTab("create");
  };

  const handleSaveComplete = () => {
    setEditingQuestion(null);
    setActiveTab("library");
    setRefreshKey(k => k + 1);
  };

  const handleCancel = () => {
    setEditingQuestion(null);
    setActiveTab("library");
  };

  const handleCreateNew = () => {
    setEditingQuestion(null);
    setActiveTab("create");
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "library" | "create")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="library" className="flex items-center gap-2">
            <Library className="h-4 w-4" />
            Library
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            {editingQuestion ? "Edit" : "Create"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-6">
          <QuestionBankLibrary 
            key={refreshKey}
            courseId={courseId}
            professorType={professorType}
            onEdit={handleEdit}
            onCreateNew={handleCreateNew}
            onSend={onSendQuestion}
            isLiveSession={isLiveSession}
          />
        </TabsContent>

        <TabsContent value="create" className="mt-6">
          <QuestionBankEditor 
            courseId={courseId}
            professorType={professorType}
            editingQuestion={editingQuestion}
            onSave={handleSaveComplete}
            onCancel={handleCancel}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
