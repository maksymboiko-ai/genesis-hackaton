-- Explanations: why a lesson is in the plan, and feedback per quiz choice.
-- Shapes mirror web/src/contracts/domain.ts.

-- LessonSummary.reason: one sentence to the child on why a replan added the
-- lesson. Null for core lessons.
alter table lesson
  add column reason text;

-- No column changes for the rest; the JSON shapes grew:
--   lesson.content        Question now has choiceFeedback (one text per choice)
--   attempt.results       QuestionResult.explanation is the feedback for the
--                         choice the child picked
--   replan_event.diagnosis  ReplanDiagnosis now has childMessage
-- Rows written before this migration lack the new keys. Lessons generated
-- earlier should be regenerated (set content_status back to 'pending').
