/**
 * Author-written text goes inside XML-style tags in the prompt. Escaping angle brackets stops a message from
 * closing those tags early and posing as instructions or facts (a basic prompt-injection defence).
 */
export function escapeUntrusted(text: string): string {
  return text.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
