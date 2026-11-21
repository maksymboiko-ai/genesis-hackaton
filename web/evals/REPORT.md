# Model evaluation: cost and efficiency

Run on 21.11.2026 against OpenRouter, through the production `AiService` (`npm run evals -- --repeat=3 <models>`). 10 models, 18 cases, 3 runs of every case: 54 runs per model, 540 in total.

## Chosen models

These are the defaults in `src/lib/ai/models.ts`.

| Task | Before | Chosen | Why |
|---|---|---|---|
| `outline` | `google/gemini-3.8-flash` | `openai/gpt-6-luna` | 27/27 against 26/27, same latency, 11× cheaper |
| `lesson` | `google/gemini-3.8-flash` | `google/gemini-3.5-flash-lite` | 12/12 for both, 3.8 s against 13.9 s, 3.6× cheaper |
| `replan` | `google/gemini-3.8-flash` | unchanged | The only model that passed 9/9; runs in the background, twice per course |
| `learner_notes` | `openai/gpt-6-luna` | unchanged | 6/6, cheapest of the reliable models |
| `book_map` | `google/gemini-3.8-flash` | `openai/gpt-6-luna` | 9/9 for both, 18 s against 33 s on a 60-section book, 13× cheaper. A separate run: see [Book map](#book-map) |

Model cost of one course (1 outline, 8 lessons, 8 notes updates, 2 replans):

| Setup | Cost per course | Against now |
|---|---|---|
| Before | $0.102 | |
| Chosen | $0.036 | 65% lower |
| Chosen, but lessons on `openai/gpt-6-luna` | $0.019 | 82% lower |

Lessons were 85% of the cost before the change, so the lesson model is the choice that matters. `gpt-6-luna` is the cheapest lesson model that passed every check, but it takes 12.8 s per lesson against 3.8 s for `gemini-3.5-flash-lite`.

**The lesson checks are structural** (question count, skills covered, length, language, textbook terms). They do not judge how well a lesson teaches.

## Results

Every model ran the same 54 runs. Cost is list price × tokens reported by OpenRouter; reasoning tokens are billed as output.

| Model | Price in / out, $ per 1M | Passed | Avg call | Slowest case | Cost per course |
|---|---|---|---|---|---|
| `google/gemini-3.8-flash` | 0.825 / 4.125 | 53/54 | 8.3 s | 42 s | $0.128 |
| `openai/gpt-6.1-terra` | 1.00 / 5.00 | 52/54 | 8.6 s | 22 s | $0.078 |
| `openai/gpt-6-luna` | 0.10 / 0.50 | 52/54 | 8.3 s | 20 s | $0.010 |
| `anthropic/claude-haiku-5.5` | 0.10 / 0.50 | 50/54 | 7.4 s | 25 s | $0.020 |
| `deepseek/deepseek-v4.1-flash` | 0.05 / 0.20 | 50/54 | 15.0 s | 55 s | $0.013 |
| `z-ai/glm-5.3-flash` | 0.04 / 0.08 | 50/54 | 28.8 s | 267 s | $0.011 |
| `google/gemini-3.5-flash-lite` | 0.30 / 2.50 | 49/54 | 2.3 s | 4 s | $0.030 |
| `meta/muse-ember` | 0.10 / 0.50 | 48/54 | 9.6 s | 38 s | $0.054 |
| `google/gemma-4-31b-it` | 0.20 / 0.40 | 47/54 | 43.5 s | 361 s | $0.007 |
| `mistralai/mistral-small-2603` | 0.15 / 0.60 | 36/54 | 4.3 s | 11 s | $0.008 |

### By task

Passed, average seconds per call, and cost per call.

| Model | Outline (27) | Lesson (12) | Replan (9) | Notes (6) |
|---|---|---|---|---|
| `google/gemini-3.8-flash` | 26 · 6.0 s · $0.0037 | 12 · 13.9 s · $0.0109 | 9 · 8.5 s · $0.0052 | 6 · 6.6 s · $0.0034 |
| `openai/gpt-6.1-terra` | 26 · 6.6 s · $0.0029 | 12 · 16.0 s · $0.0072 | 8 · 8.6 s · $0.0041 | 6 · 3.1 s · $0.0011 |
| `openai/gpt-6-luna` | 27 · 5.9 s · $0.0003 | 12 · 12.8 s · $0.0008 | 7 · 12.8 s · $0.0008 | 6 · 3.2 s · $0.0002 |
| `anthropic/claude-haiku-5.5` | 27 · 4.4 s · $0.0005 | 12 · 16.0 s · $0.0020 | 8 · 8.4 s · $0.0010 | 3 · 2.2 s · $0.0002 |
| `deepseek/deepseek-v4.1-flash` | 27 · 7.2 s · $0.0003 | 12 · 32.6 s · $0.0012 | 5 · 22.5 s · $0.0010 | 6 · 6.4 s · $0.0002 |
| `z-ai/glm-5.3-flash` | 25 · 11.0 s · $0.0002 | 12 · 74.1 s · $0.0010 | 7 · 37.1 s · $0.0006 | 6 · 5.9 s · $0.0001 |
| `google/gemini-3.5-flash-lite` | 24 · 1.9 s · $0.0011 | 12 · 3.8 s · $0.0030 | 7 · 2.0 s · $0.0011 | 6 · 1.3 s · $0.0003 |
| `meta/muse-ember` | 27 · 5.5 s · $0.0013 | 9 · 18.5 s · $0.0047 | 6 · 13.1 s · $0.0030 | 6 · 5.0 s · $0.0011 |
| `google/gemma-4-31b-it` | 22 · 73.6 s · $0.0002 | 12 · 11.5 s · $0.0006 | 7 · 4.0 s · $0.0003 | 6 · 1.5 s · $0.0001 |
| `mistralai/mistral-small-2603` | 13 · 3.7 s · $0.0004 | 12 · 7.7 s · $0.0008 | 5 · 3.8 s · $0.0004 | 6 · 1.2 s · $0.0001 |

## What failed

- **Reusing known skill slugs in a replan** is the most common miss: every model except `gemini-3.8-flash`, `gemini-3.5-flash-lite` and `glm-5.3-flash` invented a new slug for negative numbers at least once (`deepseek-v4.1-flash` 3 of 3).
- **Skipping mastered basics for a strong learner**: `gemini-3.5-flash-lite` failed 3 of 3, `mistral-small` 3 of 3, `gemma-4-31b` 2 of 3, `gemini-3.8-flash` and `gpt-6.1-terra` 1 of 3.
- **`claude-haiku-5.5` writes learner notes over 100 words** in 3 of 3 runs of one case. It is otherwise clean on outlines and lessons.
- **`mistral-small-2603` never asks clarifying questions** for a vague goal (0 of 6) and ignores the learner's weak skills (0 of 3).
- **`meta/muse-ember` lessons break the 150 to 700 word range** in 3 of 12 runs.
- **Timeouts** (90 s per request): `gemma-4-31b-it` in 2 runs. `glm-5.3-flash` and `deepseek-v4.1-flash` stay under the limit but spend 6k to 13k reasoning tokens per lesson, which is why they are slow despite the lowest prices.
- No model returned JSON that failed the schema after the single retry.

## Limits of this run

- 3 repeats per case: a one-run difference between models is noise. Replan (9 runs) and notes (6 runs) are the thinnest.
- The checks are rule-based. Nothing here scores teaching quality or factual correctness of a lesson.
- Costs are list-price estimates from token counts, not billed amounts.
- `book_map` was evaluated in a separate run, reported under [Book map](#book-map). The retrieval eval (`npm run evals:rag`) is not covered.
- `qwen/qwen3.8-flash` was dropped: it timed out repeatedly and did not complete its 54 runs.

## Book map

Run on 21.11.2026 (`npm run evals -- --only="book map" --repeat=3 <models>`). The task: given the opening 500 characters of every chunk of a book, return its sections with the chunk each one starts at. Splitting the text into chunks is code, not a model, and is the same for every model here.

Three books, each mapped 3 times per model (9 runs):

| Case | Book | Checks |
|---|---|---|
| Short | 3 chapters, 8 sections, 9 chunks | finds every section, invents none, heading chunks sit in their own section, names the chapter |
| Long | 12 chapters, 60 sections, 163 chunks | the same, plus the right chapter for each section |
| Plain | 6 lessons, no chapters, glossary and answer key, 7 chunks | the same, plus chapter is empty and the contents page and back matter are not sections |

| Model | Passed | Short | Long | Plain | Long book: time | Long book: cost |
|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` (chosen) | 9/9 | 3/3 | 3/3 | 3/3 | 17.6 s | $0.0032 |
| `google/gemini-3.5-flash-lite` | 9/9 | 3/3 | 3/3 | 3/3 | 7.4 s | $0.0142 |
| `meta/muse-ember` | 9/9 | 3/3 | 3/3 | 3/3 | 11.0 s | $0.0054 |
| `deepseek/deepseek-v4.1-flash` | 9/9 | 3/3 | 3/3 | 3/3 | 34.4 s | $0.0029 |
| `google/gemma-4-31b-it` | 9/9 | 3/3 | 3/3 | 3/3 | 32.3 s | $0.0050 |
| `openai/gpt-6.1-terra` | 9/9 | 3/3 | 3/3 | 3/3 | 24.4 s | $0.0297 |
| `google/gemini-3.8-flash` (before) | 9/9 | 3/3 | 3/3 | 3/3 | 33.0 s | $0.0415 |
| `z-ai/glm-5.3-flash` | 8/9 | 3/3 | 3/3 | 2/3 | 36.2 s | $0.0014 |
| `anthropic/claude-haiku-5.5` | 6/9 | 3/3 | 3/3 | 0/3 | 14.1 s | $0.0049 |
| `mistralai/mistral-small-2603` | 4/9 | 1/3 | 3/3 | 0/3 | 19.5 s | $0.0049 |

Time and cost are the map call alone, averaged over the 3 long-book runs (about 19k input tokens). Embedding the same book's 163 chunks is 35k tokens on `openai/text-embedding-3-small`, whatever model builds the map.

### What it shows

- **Every model mapped the 60-section book correctly**, all 30 runs. Length up to 163 chunks is not what separates them.
- **The book with no chapters does.** `claude-haiku-5.5` put the lesson heading in the chapter field in 3 of 3 runs. `mistral-small-2603` made the contents page a section in 3 of 3 runs, and on the short book dropped section 3.1 in 2 of 3. `glm-5.3-flash` put the lesson headings in the wrong chunks once.
- **No call needed a retry** and none returned invalid JSON.
- **The previous default was the slowest and most expensive model that passed.** `gpt-6-luna` is the cheapest reliable choice. `gemini-3.5-flash-lite` is the pick if the wait matters more than the cost: 7 s, at 4× the price of `gpt-6-luna`.

### Limits

- **163 chunks is about 130,000 characters, a short book.** A full textbook is several times longer, and map time grows with the number of sections the model has to write. At the measured rate a 300-section book would take `gpt-6-luna` roughly 90 s, which is the request timeout in `lib/ai/client.ts`. That is an extrapolation, not a measurement: test a real upload before relying on any model for long books.
- **The fixtures are made up and tidy.** The long book repeats the same paragraph shapes in every section. Real PDF text has running headers, page numbers and broken lines, which none of these books have.
- **Headings the chunker does not recognize are not tested.** Chunks are cut at "Chapter 3", "4.2 Title", "Lesson 3" and Markdown headings. A book with other heading styles is cut by size alone, a heading can then fall outside the 500 characters the model sees, and no model can place that section.
- 3 runs per case: a one-run difference is noise.

## Longer lessons with interactive blocks

Run on 2026-11-21, after lessons grew to 350–1,200 words with graphs, number lines, quick checks and stepped examples. The 8 lesson cases, 2 runs each (16 per model), with the new length and block checks.

| Model | Passed | Retries | Avg time | Longest | Cost per lesson |
|---|---|---|---|---|---|
| `google/gemini-3.5-flash-lite` (default) | 12/16 | 5 | 9 s | 21 s | $0.012 |
| `google/gemini-3.8-flash` | 16/16 | 0 | 34 s | 59 s | $0.026 |

- **`gemini-3.5-flash-lite` stays the default.** Before lessons were checked for length it wrote 330–570 words where 700 were asked for in 3 of 8 lessons. `generateLesson` now sends a lesson back once when it is under 80% of the smallest length, has fewer than 2 checks or has no stepped example; with that every lesson in this run reached its length. The 5 retries are those send-backs.
- **What it still gets wrong:** the correct choice sat in the same position in every quiz question (2 of 16), the book's own term "Scales Check" was missing (2 of 16), and one lesson kept a single check after the retry.
- **`gemini-3.8-flash` passed everything with no retry, but takes 34 s on average and up to 59 s.** Lessons are generated inside a route with a 60-second limit, and the next lesson is prefetched in the same job, so switching needs a longer limit first.

### Limits

- 2 runs per case: a one-run difference is noise.
- The checks are structural (length, counts, placement, valid figures). Whether a graph is the right picture for the idea, and whether the text matches it, was only read by hand in a few lessons.
