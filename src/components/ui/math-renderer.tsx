import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import ReactMarkdown from 'react-markdown';
import { Fragment, ReactNode } from 'react';

interface MathRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders text content with LaTeX math expressions.
 * - Inline math: $...$ or \(...\)
 * - Block math: $$...$$ or \[...\]
 * 
 * Also renders markdown formatting for non-math content.
 */
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  if (!content) return null;

  // Split content by math delimiters while preserving them
  // Handles: $...$, $$...$$, \(...\), \[...\]
  const parts = splitMathContent(content);

  return (
    <div className={`math-content ${className}`}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.type === 'block-math' ? (
            <div className="my-4 overflow-x-auto">
              <BlockMath math={part.content} />
            </div>
          ) : part.type === 'inline-math' ? (
            <InlineMath math={part.content} />
          ) : (
            <span className="prose prose-sm dark:prose-invert inline">
              <ReactMarkdown
                components={{
                  // Render inline to avoid extra paragraph wrappers
                  p: ({ children }) => <>{children}</>,
                }}
              >
                {part.content}
              </ReactMarkdown>
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

interface ContentPart {
  type: 'text' | 'inline-math' | 'block-math';
  content: string;
}

function splitMathContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  
  // Combined regex for all math delimiters
  // Order matters: check $$ before $ to avoid partial matches
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
  
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(content)) !== null) {
    // Add text before the math (preserve all text including whitespace)
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index);
      if (textContent) {
        parts.push({ type: 'text', content: textContent });
      }
    }

    const mathContent = match[0];
    
    // Determine math type and extract content
    if (mathContent.startsWith('$$') && mathContent.endsWith('$$')) {
      parts.push({
        type: 'block-math',
        content: mathContent.slice(2, -2).trim(),
      });
    } else if (mathContent.startsWith('$') && mathContent.endsWith('$')) {
      parts.push({
        type: 'inline-math',
        content: mathContent.slice(1, -1).trim(),
      });
    } else if (mathContent.startsWith('\\[') && mathContent.endsWith('\\]')) {
      parts.push({
        type: 'block-math',
        content: mathContent.slice(2, -2).trim(),
      });
    } else if (mathContent.startsWith('\\(') && mathContent.endsWith('\\)')) {
      parts.push({
        type: 'inline-math',
        content: mathContent.slice(2, -2).trim(),
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (preserve all text including whitespace)
  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex);
    if (textContent) {
      parts.push({ type: 'text', content: textContent });
    }
  }

  // If no parts were created, return the original content as text
  if (parts.length === 0) {
    return [{ type: 'text', content }];
  }

  return parts;
}

/**
 * Simple inline math renderer for single expressions
 */
export function InlineMathRenderer({ math }: { math: string }) {
  try {
    return <InlineMath math={math} />;
  } catch (error) {
    console.error('LaTeX rendering error:', error);
    return <code className="text-sm bg-muted px-1 rounded">{math}</code>;
  }
}

/**
 * Simple block math renderer for single expressions
 */
export function BlockMathRenderer({ math }: { math: string }) {
  try {
    return (
      <div className="my-4 overflow-x-auto">
        <BlockMath math={math} />
      </div>
    );
  } catch (error) {
    console.error('LaTeX rendering error:', error);
    return <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">{math}</pre>;
  }
}
