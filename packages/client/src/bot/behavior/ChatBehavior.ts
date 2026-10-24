import { TextPacket, TextPacketType } from '@jsprismarine/protocol';

import type { Behavior, BehaviorContext } from './Behavior';

/** Roughly one message every ten seconds at twenty ticks a second. */
const MEAN_INTERVAL_TICKS = 200;

const PHRASES = [
    'hello',
    'anyone here?',
    'nice build',
    'brb',
    'where is spawn',
    'lag?',
    'gg',
    'how do I get out of here'
] as const;

/**
 * Says something occasionally.
 *
 * Chat is the cheapest packet a client can send and the most expensive thing a server can
 * do with one: it fans out to every player, which makes this the behavior that finds
 * broadcast costs. Two hundred bots chatting once each is forty thousand deliveries.
 *
 * The interval is randomized per message rather than fixed, so a fleet does not synchronize
 * into a drumbeat that measures burst handling instead of throughput.
 */
export default class ChatBehavior implements Behavior {
    public readonly name = 'chat';

    private nextAt = 0;

    public async tick(context: BehaviorContext): Promise<void> {
        if (context.tick < this.nextAt) return;

        this.nextAt = context.tick + context.random.nextInt(MEAN_INTERVAL_TICKS / 2, MEAN_INTERVAL_TICKS * 1.5);

        // The first tick would otherwise have every bot speak at once, since they all start
        // with nextAt at zero.
        if (context.tick === 0) return;

        const identity = context.bot.identity;

        await context.send(
            new TextPacket({
                type: TextPacketType.Chat,
                needsTranslation: false,
                sourceName: identity.displayName,
                message: context.random.pick(PHRASES),
                xuid: identity.xuid,
                platformChatId: '',
                filtered: ''
            })
        );

        context.record('chat');
    }
}
