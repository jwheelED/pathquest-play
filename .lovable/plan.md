

## Plan: Remove All LaTeX — Use Plain Unicode Math Project-Wide

### Problem
All AI-generated questions currently output raw LaTeX (`$\frac{a}{b}$`, `\int_{...}`, `$$...$$`). Students see unreadable code unless the MathRenderer component successfully parses it. The user wants all math to be plain, instantly readable text using Unicode symbols.

### Scope: 6 Edge Functions + 1 Frontend Component + 10 Consumer Files

---

### Part 1: Edge Function Prompt Changes

Add this formatting block to every function that generates question text, replacing all existing LaTeX instructions:

```
MATH FORMATTING - CRITICAL:
Do NOT use LaTeX syntax. No $, \frac, \int, {, }, or backslash commands.
Write all math as plain readable text using Unicode:
- Fractions: a/b, cos x / sin x (never \frac)
- Integrals: ∫(a to b) f(x) dx
- Square roots: √x, √(x+1)
- Exponents: x², x³, e^(x²)
- Greek letters: π, θ, α, β
- Derivatives: d/dx, d²/dx², f'(x), dy/dx
- Limits: lim(h→0), lim(x→∞)
- Summation: Σ(n=1 to ∞) 1/n²
- Multiplication: · or juxtapose
- Apply to question AND all answer options
```

**Files and specific changes:**

1. **`supabase/functions/extract-voice-command-question/index.ts`** — Replace the entire "MATHEMATICS HANDLING" / "SPOKEN MATH → LATEX CONVERSION PATTERNS" block (~lines 134-185) with Unicode equivalents. Change all examples from LaTeX output to Unicode output (e.g., `lim(h→0) [(x+h)² − x²] / h`).

2. **`supabase/functions/format-and-send-question/index.ts`** — Remove the `isMathQuestion` LaTeX detection logic (~line 27). Replace the math-specific prompt section that instructs LaTeX formatting (~lines 32-58) with the Unicode formatting block. Remove `"use LaTeX notation"` from the general instructions (~line 75). Change the output instruction from `"preserve LaTeX formatting"` to `"use plain Unicode math"` (~line 82).

3. **`supabase/functions/generate-interval-question/index.ts`** — Change line 350 from `"use LaTeX $...$ for math"` to `"use plain Unicode math symbols, no LaTeX"`.

4. **`supabase/functions/generate-detailed-explanation/index.ts`** — Change line 71 from `"use LaTeX format with $ delimiters"` to `"use plain Unicode math (√, π, ∫, x², fractions as a/b)"`.

5. **`supabase/functions/extract-slide-question/index.ts`** — Add the Unicode formatting block to the MCQ and short_answer prompts.

6. **`supabase/functions/generate-slide-questions/index.ts`** — Add the Unicode formatting block to the bulk generation prompt.

---

### Part 2: Simplify MathRenderer Component

**`src/components/ui/math-renderer.tsx`** — Rewrite to a simple passthrough that only renders markdown (no KaTeX). Remove `InlineMath`, `BlockMath`, `react-katex` imports, and the `splitMathContent` function. The component becomes:

```tsx
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  if (!content) return null;
  return (
    <span className={className}>
      <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>
        {content}
      </ReactMarkdown>
    </span>
  );
}
```

Remove `InlineMathRenderer` and `BlockMathRenderer` exports (check if used — if so, simplify them to plain text wrappers).

The 10 consumer files (`LiveStudent.tsx`, `AssignedContent.tsx`, `LiveSessionResults.tsx`, `StudioQuestionCard.tsx`, `InstructorLecturePreview.tsx`, `LectureCheckInHistory.tsx`, etc.) need **no changes** since they all call `<MathRenderer content={...} />` which will now just render plain text.

---

### Part 3: Optional Cleanup

- Remove `katex` and `react-katex` from `package.json` dependencies (saves ~300KB bundle).
- Remove `katex/dist/katex.min.css` import.

---

### Files Modified
- `supabase/functions/extract-voice-command-question/index.ts`
- `supabase/functions/format-and-send-question/index.ts`
- `supabase/functions/generate-interval-question/index.ts`
- `supabase/functions/generate-detailed-explanation/index.ts`
- `supabase/functions/extract-slide-question/index.ts`
- `supabase/functions/generate-slide-questions/index.ts`
- `src/components/ui/math-renderer.tsx`
- `package.json` (remove katex, react-katex)

No database changes. No new files.

