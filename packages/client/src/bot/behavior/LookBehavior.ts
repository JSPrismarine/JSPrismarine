import type { Behavior, BehaviorContext } from './Behavior';

/** How often the head turns, in ticks. Faster than this is twitching, not looking. */
const TURN_INTERVAL_TICKS = 10;

/**
 * Turns the head without moving.
 *
 * Separate from walking because it loads a server differently: a rotation is an input that
 * changes nothing about which chunks or entities a player can see, so it exercises the
 * broadcast path without touching the streaming one. Running it alone is how you find out
 * how much of a server's cost is simply *relaying* movement.
 */
export default class LookBehavior implements Behavior {
    public readonly name = 'look';

    public tick(context: BehaviorContext): void {
        if (context.tick % TURN_INTERVAL_TICKS !== 0) return;

        const { bot, random } = context;

        bot.yaw = random.nextFloat(-180, 180);
        bot.headYaw = bot.yaw;
        // Straight up and straight down are the limits; beyond them the client would be
        // sending a rotation no real player can produce.
        bot.pitch = random.nextFloat(-90, 90);

        context.input();
        context.record('look');
    }
}
