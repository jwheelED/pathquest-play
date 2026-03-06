
## Plan: Move Slide Question Generation into Question Bank

**STATUS: COMPLETED**

Slide question generation has been moved from Slide Presenter to Question Bank. Instructors now upload PDF/PPTX directly in the Question Bank tab, AI generates questions stored as regular bank questions with source tracking. Slide Presenter is now purely a presentation tool. DB columns `source_material_id` and `source_material_title` added to `instructor_question_bank`. Edge function updated to support `target: "question_bank"`.
