# Critical Paths — Edvana

These are load-bearing flows. Any AI tool modifying code that touches these paths must be told explicitly which path is affected and warned not to alter unrelated logic.

## 1. Authentication & role assignment
- Postgres trigger: handle_new_user
- RPC: assign_oauth_role
- Frontend: signup handler, OAuth callback handler
- Invariant: instructor role is inserted exactly once per signup. Trigger and RPC must not both attempt insertion.

## 2. Live session lifecycle
- Session creation, join, real-time student presence, session end
- Tables: sessions, session_participants
- Real-time channels: anything subscribed to session state
- Invariant: students see instructor state changes within 2 seconds.

## 3. Question pickup & trigger detection
- Hook: usePassiveQuestionDetection
- Deepgram interim and final transcript handlers
- Cooldown logic, trigger-fire conditions
- Invariant: a question fires once per natural utterance, not on partial chunks.

## 4. Question generation & dispatch
- Edge function: generate-mcq-options
- Edge function: detect-speaker-questions
- Frontend: question preview, send-to-students action
- Invariant: question dispatched to students matches question previewed by instructor.

## 5. Answer collection & grading
- Student answer submission
- Grading logic (correct, incorrect, partial)
- Aggregate display for instructor
- Invariant: every submitted answer is recorded once. No double-submission.

## 6. Transcript persistence
- Deepgram pipeline
- Storage of utterances and lecture_pause_points
- Invariant: no transcript chunks lost on disconnect or session end.

## 7. Billing & tier limits
- Stripe webhooks
- Usage tracking (teaching hours)
- Tier transitions: free, Starter, Professional, Department, Institution
- Invariant: usage cannot exceed tier limit without upgrade prompt or block.

## Rules for AI tools modifying any of the above
1. Identify which numbered path the change affects before writing code.
2. Do not modify code in adjacent paths unless explicitly approved.
3. Flag any change to a Postgres trigger AND a frontend handler in the same PR. These must be paired and reviewed together.
4. After change, list every file modified and why.
