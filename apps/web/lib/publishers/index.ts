// Publisher registry. The dispatcher imports `adapters` and routes a post by
// platform. LinkedIn is intentionally absent — it is extracted separately and
// the dispatcher will register it alongside these.

import { hostedAdapter } from "./hosted";
import { wordPressAdapter } from "./wordpress";
import type { PublishAdapter } from "./types";

export const adapters: Record<string, PublishAdapter> = {
  hosted: hostedAdapter,
  wordpress: wordPressAdapter,
};

export { hostedAdapter } from "./hosted";
export {
  wordPressAdapter,
  validateWordPressCredential,
  WordPressCredentialSchema,
  type WordPressCredential,
} from "./wordpress";

export type {
  PublishAdapter,
  PublishContext,
  PublishOutcome,
  PublishablePost,
} from "./types";
