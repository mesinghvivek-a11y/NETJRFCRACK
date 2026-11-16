# Workbook format (for people and for any AI or tool that fills the workbook)

The site reads an Excel (.xlsx) file. If a file does not follow this format it is rejected with a message that names the problem.
The reference file is `Final_UGC_NET_Workbook.xlsx` (same structure as `UGC_NET_question_workbook_v2.xlsx`). Copy it, do not rebuild it.

## Rules that must not change
1. The file must be a real Excel (.xlsx) workbook. Not CSV, not Numbers, not .xls. Export as Excel (.xlsx).
2. Sheet names, exactly: `Papers`, `Questions`, `Passages` (Passages can stay empty). Other sheets such as `Column guide`, `Syllabus` and `Lists` may stay, they are ignored.
3. Row 1 of each sheet holds the column headings, exactly as below. Data starts on row 2. Do not add title rows, merged cells or blank rows above the headings.
4. One question per row. One paper (or shift) per row on the Papers sheet.
5. Never type the ids. `paper_id (auto)` and `question_id (auto)` are built from the other columns (the site rebuilds them itself).
6. Delete example rows (their `notes` start with EXAMPLE) or leave them: rows starting with EXAMPLE are ignored.

## IDs
- Paper code = NTA subject code - year - JUN or DEC - E. Example `80-2025-JUN-E`. A second shift adds `-S2`, a re-exam adds `-R` (for example `80-2025-JUN-E-S2-R`).
- Question id = paper code - question number with three digits. Example `80-2025-JUN-E-045`.
- In the Questions sheet, `paper_id` must be the paper code of a row on the Papers sheet.

## Papers sheet headings (row 1, in this order)
paper_id (auto), subject, subject_code (auto), year, session, language, exam_kind, shift, exam_date, total_questions, duration_minutes, max_marks, answer_key_source, answer_key_status, source_name, notes, entered (auto), status (auto)
Needed: subject, year, session (june or december), language (E), exam_kind (regular or reexam), shift (1, 2, ...), total_questions (100, 75 or 50).

## Questions sheet headings (row 1, in this order)
question_id (auto), check (auto), paper_id, q_no, format, paragraph, question_en, statements, table, image_file, opt_a, opt_b, opt_c, opt_d, correct, answer_status, key_source, explanation, expl_a, expl_b, expl_c, expl_d, references, primary_topic, extra_tags, difficulty, nature, passage_id, canonical_of, source_ref, review_status, notes, paragraph_hi, question_hi, statements_hi, opt_a_hi, opt_b_hi, opt_c_hi, opt_d_hi
Needed: paper_id, q_no, format, question_en, opt_a, opt_b, opt_c, opt_d, correct, answer_status, primary_topic.

- format: mcq, statement, assertion_reason, matching, table, image
- correct: A, B, C or D (B,C for more than one; blank only when answer_status is dropped)
- answer_status: final, provisional, dropped, multiple, disputed
- primary_topic: a syllabus code such as `geo-u04-t01` (a topic name such as `Tides` or `Unit 4` also works). extra_tags: more of these, separated by semicolons.
- paragraph = text shown above the question. statements = one statement per line (Alt+Enter in Excel). table = header row first, cells separated by |, one row per line.
- difficulty: easy, medium, hard. nature: factual, conceptual, analytical, application, map_or_diagram. review_status: draft or verified.

## Passages sheet headings
passage_id, paper_id, text_en, text_hi

## Instruction to paste into another AI or tool
"Fill the attached Excel workbook without changing its structure. Keep the sheet names Papers, Questions and Passages, keep row 1 headings exactly as they are, put one question per row starting on row 2, and do not rename, add, delete or reorder columns. Save the result as .xlsx. Use the syllabus codes from the Syllabus sheet in primary_topic. Do not fill the columns marked (auto)."

## What the site accepts besides the exact names
The reader also understands common alternatives (for example `Question No`, `Option A`, `Answer`, `Topic`, a sheet called `Question_Bank`, session `June`, exam type `Re-Exam`). Do not rely on this when making files: use the exact format above.
