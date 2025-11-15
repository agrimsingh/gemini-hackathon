export function detectFinishIntent(text: string): boolean {
  const finishKeywords = /\b(finish|done|complete|wrap up|end this|finalize|let's finish|i'm done|we're done)\b/i;
  return finishKeywords.test(text);
}


