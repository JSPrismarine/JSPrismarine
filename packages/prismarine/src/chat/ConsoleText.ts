import type { Chat } from './Chat';
import { ChatType } from './Chat';

/**
 * English text for the translation keys the server sends.
 *
 * A translated chat carries a `%`-prefixed key and the names to fill it with, and every
 * client renders it in its own language. The console has no client, so it printed the key:
 * `%multiplayer.player.joined` where `filfat joined the game` was meant. This table is the
 * English for the keys the server itself emits, and nothing more; the repository has no
 * `.lang` file to resolve keys in general.
 *
 * Templates use vanilla's placeholders: `%s` takes the next parameter, `%1$s` the first.
 * @see https://minecraft.wiki/w/Death_messages
 */
const CONSOLE_TEXT: Record<string, string> = {
    'multiplayer.player.joined': '%s joined the game',
    'multiplayer.player.left': '%s left the game',

    // Deaths with nobody to blame.
    'death.attack.generic': '%1$s died',
    'death.attack.drown': '%1$s drowned',
    'death.attack.starve': '%1$s starved to death',
    'death.fell.accident.generic': '%1$s fell from a high place',
    'death.attack.inFire': '%1$s went up in flames',
    'death.attack.lava': '%1$s tried to swim in lava',
    'death.attack.outOfWorld': '%1$s fell out of the world',
    'death.attack.explosion': '%1$s blew up',
    'death.attack.cactus': '%1$s was pricked to death',
    'death.attack.inWall': '%1$s suffocated in a wall',
    'death.attack.magic': '%1$s was killed by magic',
    'death.attack.wither': '%1$s withered away',

    // The same deaths with a killer. Victim first, killer second.
    'death.attack.player': '%1$s was slain by %2$s',
    'death.attack.mob': '%1$s was slain by %2$s',
    'death.attack.arrow': '%1$s was shot by %2$s',
    'death.attack.explosion.player': '%1$s was blown up by %2$s',
    'death.attack.indirectMagic': '%1$s was killed by %2$s using magic',
    'death.attack.thorns': '%1$s was killed trying to hurt %2$s',
    'death.attack.inFire.player': '%1$s walked into fire while fighting %2$s'
};

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
    const template = CONSOLE_TEXT[bareKey];

    if (template === undefined) {
        return parameters.length ? `${bareKey} [${parameters.join(', ')}]` : bareKey;
    }

    let next = 0;
    return template
        .replace(/%(\d+)\$s/g, (_, index: string) => parameters[Number(index) - 1] ?? '')
        .replace(/%s/g, () => parameters[next++] ?? '');
};

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
