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

import type Player from '../Player';
import { TextPacketType } from '@jsprismarine/protocol';
import { advancementsOf } from './progress';

/** Raises one trigger for one player and announces whatever it completed. */
export const raiseAdvancement = <K extends TriggerName>(player: Player, trigger: K, event: TriggerEvents[K]): void => {
    const engine = player.getServer().getContent().advancements;
    const completed = engine.raise(trigger, event, advancementsOf(player));
    for (const id of completed) void announce(player, id);
};

/**
 * Tells the world that somebody earned something.
 *
 * `chat.type.achievement` is the nearest Bedrock key - "%s has just earned the
 * achievement %s" - and it is sent translated so a client in another language
 * reads its own. The name is a different matter: a Java advancement's title is
 * a chat component naming a key like `advancements.story.mine_stone.title`,
 * and a Bedrock client has no such string, so what goes out is the key or the
 * literal text the component carries, and the advancement id when it carries
 * neither. Teaching the client the real names needs a resource pack with those
 * keys in it, which is a different job from this one.
 */
const announce = async (player: Player, id: string): Promise<void> => {
    const advancement = player.getServer().getContent().advancements.get(id);
    const display = advancement?.display;
    if (display?.announceToChat === false || display === undefined) return;

    const name = titleOf(display.title) ?? id;

    await Promise.all(
        player
            .getWorld()
            .getPlayers()
            .map((recipient) =>
                recipient.sendMessage('chat.type.achievement', TextPacketType.Translate, [player.getName(), name], true)
            )
    );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A readable name out of a chat component, which the engine keeps as the JSON
 * it parsed. Turning a component into text belongs to a text layer this server
 * does not have yet, so this takes the one field that is already a string.
 */
const titleOf = (title: unknown): string | undefined => {
    if (typeof title === 'string') return title;
    if (!isRecord(title)) return undefined;
    if (typeof title.text === 'string') return title.text;
    return typeof title.translate === 'string' ? title.translate : undefined;
};
