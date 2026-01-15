import { forwardRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { EditorView } from "@codemirror/view";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { indentOnInput, bracketMatching } from "@codemirror/language";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onCopy?: (e: React.ClipboardEvent) => void;
  language?: string;
  placeholder?: string;
}

const getLanguageExtension = (language?: string) => {
  const lang = language?.toLowerCase() || '';
  
  if (lang.includes('python') || lang === 'py') {
    return python();
  } else if (lang.includes('java')) {
    return java();
  } else if (lang.includes('c++') || lang === 'cpp') {
    return cpp();
  } else if (lang.includes('javascript') || lang === 'js' || lang.includes('typescript') || lang === 'ts') {
    return javascript({ typescript: lang.includes('typescript') || lang === 'ts' });
  }
  
  // Default to JavaScript
  return javascript();
};

export const CodeEditor = forwardRef<HTMLDivElement, CodeEditorProps>(
  ({ value, onChange, onPaste, onCopy, language, placeholder }, ref) => {
    const extensions = [
      getLanguageExtension(language),
      autocompletion(),
      closeBrackets(),
      indentOnInput(),
      bracketMatching(),
      EditorView.lineWrapping,
    ];

    return (
      <div 
        ref={ref}
        onPaste={onPaste as any}
        onCopy={onCopy as any}
        className="border rounded-lg overflow-hidden"
      >
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme="dark"
          placeholder={placeholder}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          className="text-sm"
          style={{ fontSize: '14px' }}
        />
      </div>
    );
  }
);

CodeEditor.displayName = "CodeEditor";
