import DOMPurify from "dompurify";

/**
 * Sanitize user-supplied HTML to prevent XSS before rendering with dangerouslySetInnerHTML.
 * Only allows safe formatting tags produced by the TipTap rich text editor.
 */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "b", "i", "u", "s",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "hr", "a",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
    FORCE_BODY: true,
  });
}
