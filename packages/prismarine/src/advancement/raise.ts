/**
 * The one way a game event reaches the advancement engine.
 *
 * `engine.raise(trigger, event, progress)` is the engine's whole seam, and
 * this is the whole of the server's side of it: find the content, find the
 * player's progress, raise, and announce whatever completed. Every trigger
 * helper in `triggers.ts` goes through here, so the questions that have one
 * answer - what a completion is announced as, what a player in spectator
 * earns - are answered once.
 *
 * Raising is synchronous and deliberately so. The engine evaluates in the
 * caller's tick and the biggest vanilla bucket is 1914 criteria at well under
 * a microsecond each, so a raise costs the caller something it can afford;
 * deferring would mean an event whose world has already moved on by the time
 * its conditions are evaluated.
 */
import type { TriggerEvents, TriggerName } from '@jsprismarine/advancements';

import type Server from '../Server';
import { TextPacketType } from '@jsprismarine/protocol';
import { advancementsOf } from './progress';
import { isRecord } from '../utils/isRecord';
import type { KeyedPlayerHolder } from '../keyedPlayer';
import type { JavaEnglish } from './javaEnglish';

/** A player who hears an announcement: its session. */
interface AnnouncementRecipient {
    sendMessage(delivery: {
        message: string;
        type: TextPacketType;
        parameters: string[];
        needsTranslation: boolean;
    }): Promise<void>;
}

/** The world an announcement goes out to. */
export interface AnnouncingWorld {
    getViewers(): readonly AnnouncementRecipient[];
}

/**
 * What a raise reads of the player who earned something: the key and the server its progress is
 * found by, the name an announcement carries, and the world whose players hear it.
 */
export interface RaisingPlayer extends KeyedPlayerHolder {
    getName(): string;
    getWorld(): AnnouncingWorld;
}

/**
 * Raises one trigger for one player and announces whatever it completed.
 * @param player - Who the event happened to.
 * @param trigger - The trigger the event is.
 * @param event - What the trigger's conditions read.
 */
export const raiseAdvancement = <K extends TriggerName>(
    player: RaisingPlayer,
    trigger: K,
    event: TriggerEvents[K]
): void => {
    const keyed = player.keyed();
    const completed = keyed.server.getContent().advancements.raise(trigger, event, advancementsOf(keyed));
    for (const id of completed) void announce(player, keyed.server, id);
};

/**
 * Tells the world that somebody earned something.
 *
 * `chat.type.achievement` is the nearest Bedrock key - "%s has just earned the
 * achievement %s" - and it is sent translated so a client in another language
 * reads its own. The name is a different matter: a Java advancement's title is
 * a chat component naming a key like `advancements.story.mine_stone.title`,
 * and a Bedrock client has no such string, so a `%` in front of it would show
 * the key all the same. The server names it in English from Java's own strings,
 * and falls back to the key, or to the advancement id when the title carries
 * neither a key nor text.
 */
const announce = async (player: RaisingPlayer, server: Server, id: string): Promise<void> => {
    const advancement = server.getContent().advancements.get(id);
    const display = advancement?.display;
    if (display?.announceToChat === false || display === undefined) return;

    const name = titleOf(display.title, server.getJavaEnglish()) ?? id;

    await Promise.all(
        player
            .getWorld()
            .getViewers()
            .map((recipient) =>
                recipient.sendMessage({
                    message: 'chat.type.achievement',
                    type: TextPacketType.Translate,
                    parameters: [player.getName(), name],
                    needsTranslation: true
                })
            )
    );
};

/**
 * A readable name out of a chat component, which the engine keeps as the JSON
 * it parsed. Turning a component into text belongs to a text layer this server
 * does not have yet, so this takes the one field that is already a string, and
 * a `translate` key's English text when Java's strings have it.
 */
const titleOf = (title: unknown, english: JavaEnglish): string | undefined => {
    if (typeof title === 'string') return title;
    if (!isRecord(title)) return undefined;
    if (typeof title.text === 'string') return title.text;
    if (typeof title.translate !== 'string') return undefined;
    return english.get(title.translate) ?? title.translate;
};
