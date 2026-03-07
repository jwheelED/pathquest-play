
## Plan: Rework Live Session Logic — Grading Accuracy & Timer Reliability

**STATUS: COMPLETED**

Fixed 4 bugs: (1) MCQ result display now shows Correct/Incorrect with green/red feedback instead of generic "Response Recorded", (2) Empty correctAnswer guard prevents all-answers-wrong bug by returning 422 error, (3) Removed dangerous first-char fallback in normalizeAnswer that misinterpreted words starting with A-D as answer letters, (4) Stabilized auto-question timer by using refs instead of state in useEffect dependencies to prevent interval teardown/recreation.
