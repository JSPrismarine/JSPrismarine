import type { Behavior, BehaviorContext } from './Behavior';

/** How far a walking player covers in one server tick, in blocks. Vanilla is about this. */
const BLOCKS_PER_TICK = 0.21;

/** Ticks a bot keeps walking one way before choosing another. */
const MIN_LEG_TICKS = 20;
const MAX_LEG_TICKS = 100;

/**
 * Walks, changing direction now and then.
 *
 * A random walk rather than a path: the load this puts on a server is chunk streaming and
 * entity tracking, and both care about *where* players are and how fast that changes, not
 * about whether the route makes sense. Pathfinding would only make the traffic harder to
 * reason about.
 *
 * The bot keeps its own position because the client core has no game state layer yet. That
 * means it can walk into a wall and the server will simply not agree - which is fine for
 * measuring, and would not be fine for anything else.
 */
export default class WalkBehavior implements Behavior {
    public readonly name = 'walk';

    private legTicksLeft = 0;
    private headingRadians = 0;

    public tick(context: BehaviorContext): void {
        const { bot, random } = context;

        if (this.legTicksLeft <= 0) {
            this.headingRadians = random.nextFloat(0, Math.PI * 2);
            this.legTicksLeft = random.nextInt(MIN_LEG_TICKS, MAX_LEG_TICKS);
        }
        this.legTicksLeft--;

        // Yaw is degrees clockwise from south (+z) in Bedrock, so facing it is (-sin, cos) on
        // x and z. The bot walks the way it faces, as a client holding forward does, and the
        // head follows the body unless something else is turning it.
        const x = -Math.sin(this.headingRadians) * BLOCKS_PER_TICK;
        const z = Math.cos(this.headingRadians) * BLOCKS_PER_TICK;
        bot.position.x += x;
        bot.position.z += z;
        bot.yaw = (this.headingRadians * 180) / Math.PI;
        bot.headYaw = bot.yaw;

        context.input({ x, z });
        context.record('move');
    }
}
