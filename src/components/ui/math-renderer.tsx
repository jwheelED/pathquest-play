import ReactMarkdown from 'react-markdown';

interface MathRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders text content with optional markdown formatting.
 * All math is expected in plain Unicode (no LaTeX).
 */
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  if (!content) return null;

  return (
    <span className={`math-content ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}

/**
 * Simple inline math renderer — now just renders plain text
 */
export function InlineMathRenderer({ math }: { math: string }) {
  return <span>{math}</span>;
}

/**
 * Simple block math renderer — now just renders plain text
 */
export function BlockMathRenderer({ math }: { math: string }) {
  return <div className="my-4">{math}</div>;
}
