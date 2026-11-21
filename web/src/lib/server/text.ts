import "server-only";
import { SkillSlug } from "@/contracts/domain";

// Control characters except tab, newline and carriage return.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trims, strips control characters, NFC-normalizes and caps a string. */
export function cleanText(value: string, max: number): string {
  return value.normalize("NFC").replace(CONTROL, "").trim().slice(0, max);
}

/**
 * Defense in depth for model-written markdown (ADR 0002): the frontend
 * renders it without raw HTML; we still drop active HTML and script URLs.
 */
export function sanitizeMarkdown(md: string, max: number): string {
  return cleanText(md, max)
    .replace(/<\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\]\(\s*(javascript|vbscript|data):[^)]*\)/gi, "](#)");
}

/** Turns free text into a skill slug, or null if nothing is left. */
export function toSkillSlug(value: string): string | null {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return SkillSlug.safeParse(slug).success ? slug : null;
}
