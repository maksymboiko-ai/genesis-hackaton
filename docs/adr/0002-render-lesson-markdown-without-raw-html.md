# ADR 0002: Render lesson markdown without raw HTML

- **Status:** Accepted
- **Date:** 2026-11-21
- **Owner:** Frontend (rendering), Backend (defense in depth)
- **Affects:** every component that renders `GetLessonResponse.content.bodyMarkdown`

## Context

`bodyMarkdown` is written by a model. Its input includes text we don't
control: the parent's prompt and uploaded PDF books. A prompt injection can
make the model output `<script>`, `<img src=x onerror=...>` or
`[link](javascript:...)`. The readers are children.

React escapes strings in JSX, so rendering the text itself is safe. The risk
appears when markdown is converted to HTML and React's escaping is bypassed.

## Decision

1. Render `bodyMarkdown` with **`react-markdown`** using its defaults.
2. **Never** use `rehype-raw` (it re-enables raw HTML).
3. **Never** use `dangerouslySetInnerHTML` for model output (for example with `marked` or `markdown-it` output).
4. Links: allow only `http`, `https` and `mailto` (the `react-markdown` default URL transform already drops `javascript:`).
5. Backend strips `<script|iframe|object|embed|style>` tags and `javascript:` links before storing lesson content, as a second layer.

## Consequences

- ✅ Model output can't run code in the browser (no XSS).
- ✅ One dependency, no custom sanitizer to maintain.
- ⚠️ Lessons can't use raw HTML (colored text, embedded media). If needed later, add it through a sanitizer such as `rehype-sanitize` with an allow-list, in a new ADR.
- ⚠️ Code review checks for `dangerouslySetInnerHTML` and `rehype-raw` on any lesson-rendering change.
