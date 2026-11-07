import 'server-only';
import type { Tone, ToneClassifier } from '@ft/shared';

const ACTION =
  /\b(should|needs?|could|wish|confus\w*|improve\w*|missing|hard|unclear|don'?t|doesn'?t|isn'?t|not|change|add|fix|remove|but|instead|maybe|try|consider)\b/i;
const PRAISE =
  /\b(love\w*|great|nice|like|good|clear|strong|well|beautiful|cool|amazing|excellent|clean)\b/i;

/** Mock (tests): a deterministic keyword rule. Anything suggesting change counts as action. */
export function mockTone(text: string): Tone {
  if (ACTION.test(text)) return 'action';
  if (PRAISE.test(text)) return 'praise';
  return 'note';
}
export function mockToneClassifier(): ToneClassifier {
  return {
    name: 'mock',
    async classify(items) {
      return { items: items.map((i) => ({ id: i.id, tone: mockTone(i.text) })) };
    },
  };
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tone: { type: 'string', enum: ['action', 'praise', 'note'] },
        },
        required: ['id', 'tone'],
      },
    },
  },
  required: ['items'],
};

const PROMPT = `You label portfolio-review comments for the portfolio's owner, so they know what to act on.
For each comment return one tone:
- "action": anything the owner might change: a problem, a criticism, confusion, something missing, a question, or a suggestion. Negative opinions are action even without a fix ("they're all bad", "I can't read this"). Mixed praise and criticism is action.
- "praise": only positive; nothing to change ("love the opening animation", "great use of images").
- "note": neutral narration or description with no opinion ("next I'm looking at the first project", "this is the about page").
Examples: "I don't entirely know what you did here" → action. "Header looks good, tells me the services right away" → praise. "Okay, scrolling down to the contact section" → note.
Return every id exactly once. Do not change or repeat the comment text.`;

/** Local Ollama (same model as the anchor resolver). Returns raw JSON; the caller validates it. */
export function ollamaToneClassifier(
  url: string,
  model: string,
  timeoutMs = 60_000,
): ToneClassifier {
  return {
    name: `ollama:${model}`,
    async classify(items) {
      const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: SCHEMA,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: PROMPT },
            {
              role: 'user',
              content: JSON.stringify(items.map((i) => [i.id, i.text.slice(0, 1500)])),
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`ollama ${res.status}`);
      const body = (await res.json()) as { message?: { content?: string } };
      return JSON.parse(body.message?.content ?? 'null') as unknown;
    },
  };
}
