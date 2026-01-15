import { useState } from "react";
import { AnswerKeyUpload } from "./AnswerKeyUpload";
import { AnswerKeyLibrary } from "./AnswerKeyLibrary";
import { AnswerKeyDetail } from "./AnswerKeyDetail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Upload } from "lucide-react";

type View = "library" | "upload" | "detail";

export function AnswerKeyManager() {
  const [view, setView] = useState<View>("library");
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("library");

  const handleSelectKey = (keyId: string) => {
    setSelectedKeyId(keyId);
    setView("detail");
  };

  const handleBack = () => {
    setSelectedKeyId(null);
    setView("library");
    setActiveTab("library");
  };

  const handleUploadComplete = (answerKeyId: string) => {
    setSelectedKeyId(answerKeyId);
    setView("detail");
  };

  const handleCreateNew = () => {
    setActiveTab("upload");
    setView("upload");
  };

  if (view === "detail" && selectedKeyId) {
    return <AnswerKeyDetail answerKeyId={selectedKeyId} onBack={handleBack} />;
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="library" className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Library
        </TabsTrigger>
        <TabsTrigger value="upload" className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload New
        </TabsTrigger>
      </TabsList>

      <TabsContent value="library">
        <AnswerKeyLibrary
          onSelectKey={handleSelectKey}
          onCreateNew={handleCreateNew}
        />
      </TabsContent>

      <TabsContent value="upload">
        <AnswerKeyUpload onUploadComplete={handleUploadComplete} />
      </TabsContent>
    </Tabs>
  );
}
