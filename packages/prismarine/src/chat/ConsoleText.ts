import type { Chat } from './Chat';
import { ChatType } from './Chat';
import { ENGLISH } from '@jsprismarine/protocol/java/versions/26.3/lang';

/** The server's own words, which no client has a translation of. */
const OWN_TEXT = {
    'jsprismarine.disconnect.banned': 'You have been banned!',
    'jsprismarine.disconnect.banned.reason': 'You have been banned for reason: %s!',
    'jsprismarine.disconnect.not_invited': 'You are not invited to this server.',
    'jsprismarine.disconnect.server_full': 'Server is full!',
    'jsprismarine.disconnect.join_refused': 'You were not let into the world.',
    'jsprismarine.disconnect.java_not_taken': 'This server does not take Java Edition players yet.'
} as const satisfies Record<string, string>;

/**
 * English text for the translation keys the server sends.
 *
 * A translated chat carries a `%`-prefixed key and the names to fill it with, and every client
 * renders it in its own language. The console has no client, so it printed the key:
 * `%multiplayer.player.joined` where `filfat joined the game` was meant. This table is the English
 * for the keys the server itself emits: vanilla's, generated from the pinned Java release's
 * `en_us.json` by `dump:java-protocol`, and the server's own under `jsprismarine.` keys, such as
 * why a login is refused. Code names a {@link TranslationKey}, and each edition and the console
 * take the text from here.
 *
 * Templates use vanilla's placeholders: `%s` takes the next parameter, `%1$s` the first.
 */
const CONSOLE_TEXT = { ...ENGLISH, ...OWN_TEXT };

/** A key the server has English for. */
export type TranslationKey = keyof typeof CONSOLE_TEXT;

/** Whether the server has English for a key. */
const isTranslationKey = (key: string): key is TranslationKey => Object.hasOwn(CONSOLE_TEXT, key);

/**
 * Fills a translation key's English template with its parameters.
 *
 * Positional placeholders (`%1$s`) are filled first, then each plain `%s` takes the next
 * parameter in turn. A key without a template comes back as itself, followed by its parameters
 * in brackets, so the console still shows what was sent.
 * @param key - The translation key, with or without the leading `%`.
 * @param parameters - The values to fill the template with, in order.
 * @example
 * ```typescript
 * translateForConsole('%multiplayer.player.joined', ['filfat']);
 * // => 'filfat joined the game'
 * ```
 */
export const translateForConsole = (key: string, parameters: readonly string[]): string => {
    const bareKey = key.startsWith('%') ? key.slice(1) : key;
    const template = isTranslationKey(bareKey) ? CONSOLE_TEXT[bareKey] : undefined;

    if (template === undefined) {
        return parameters.length ? `${bareKey} [${parameters.join(', ')}]` : bareKey;
    }

    let next = 0;
    return template
        .replace(/%(\d+)\$s/g, (_, index: string) => parameters[Number(index) - 1] ?? '')
        .replace(/%s/g, () => parameters[next++] ?? '');
};

/**
 * A known key's English, filled with its parameters: what the console prints, and what a client
 * that has no translation of the key is shown.
 * @param key - The key.
 * @param parameters - The values to fill the template with, in order.
 * @returns The text.
 */
export const englishOf = (key: TranslationKey, ...parameters: string[]): string => translateForConsole(key, parameters);

/**
 * The line the console should print for a chat.
 *
 * Translated chats are rendered through {@link translateForConsole}. A player's chat gets
 * `<name>` in front of it, as the client draws it from the packet's author. Everything else
 * is the message as written, color codes included. The chat itself is not changed, so players
 * still receive the key and parameters and translate them client-side.
 */
export const consoleTextOf = (chat: Chat): string => {
    if (chat.getType() === ChatType.TRANSLATION || chat.isNeedsTranslation()) {
        return translateForConsole(chat.getMessage(), chat.getParameters());
    }

    if (chat.getType() === ChatType.CHAT) {
        return `<${chat.getSender().getName()}> ${chat.getMessage()}`;
    }

    return chat.getMessage();
};
