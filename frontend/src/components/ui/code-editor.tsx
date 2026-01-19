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
  height?: string; // Allow custom height
  simpleMode?: boolean; // Simpler UI for check-ins
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
  ({ value, onChange, onPaste, onCopy, language, placeholder, height = "300px", simpleMode = false }, ref) => {
    const extensions = [
      getLanguageExtension(language),
      autocompletion(),
      closeBrackets(),
      indentOnInput(),
      bracketMatching(),
      EditorView.lineWrapping,
    ];

    return (
      <div className="space-y-2">
        {/* Language indicator for simple mode */}
        {simpleMode && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-t-lg border-b">
            <span className="font-mono font-semibold uppercase">{language || 'python'}</span>
            <span className="text-[10px]">• Mini IDE • Syntax highlighting enabled</span>
          </div>
        )}
        
        <div 
          ref={ref}
          onPaste={onPaste as any}
          onCopy={onCopy as any}
          className={`border rounded-lg overflow-hidden ${simpleMode ? 'rounded-t-none' : ''}`}
          style={{ minHeight: height }}
        >
          <CodeMirror
            value={value}
            onChange={onChange}
            extensions={extensions}
            theme="dark"
            placeholder={placeholder}
            height={height}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: !simpleMode, // Simpler mode without folding
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: !simpleMode,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              searchKeymap: !simpleMode, // Simpler without search UI
              foldKeymap: !simpleMode,
              completionKeymap: true,
              lintKeymap: false, // No linting to keep it simple
            }}
            className="text-sm"
            style={{ fontSize: '14px' }}
          />
        </div>
        
        {/* Helper text for simple mode */}
        {simpleMode && (
          <div className="text-xs text-muted-foreground px-1 flex items-center gap-3">
            <span>💡 Tips: Press Tab to indent • Ctrl+Space for suggestions</span>
          </div>
        )}
      </div>
    );
  }
);

CodeEditor.displayName = "CodeEditor";
