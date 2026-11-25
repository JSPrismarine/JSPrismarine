/**
 * Java Edition 26.3's English for the keys the server sends or prints itself: why a client is
 * disconnected, who joined and left, and how a player died. `lang.json` is generated from the
 * server jar's `en_us.json`.
 */
import lang from './lang.json' with { type: 'json' };

/** Translation key to English text. */
export const ENGLISH: Readonly<typeof lang> = lang;
