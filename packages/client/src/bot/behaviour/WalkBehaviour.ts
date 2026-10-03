import { MovePlayerPacket, MovementType } from '@jsprismarine/protocol';

import type { Behaviour, BehaviourContext } from './Behaviour';

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
export default class WalkBehaviour implements Behaviour {
    public readonly name = 'walk';

    private legTicksLeft = 0;
    private headingRadians = 0;

    public async tick(context: BehaviourContext): Promise<void> {
        const { bot, random } = context;

        if (this.legTicksLeft <= 0) {
            this.headingRadians = random.nextFloat(0, Math.PI * 2);
            this.legTicksLeft = random.nextInt(MIN_LEG_TICKS, MAX_LEG_TICKS);
        }
        this.legTicksLeft--;

        bot.position.x += Math.cos(this.headingRadians) * BLOCKS_PER_TICK;
        bot.position.z += Math.sin(this.headingRadians) * BLOCKS_PER_TICK;
        // Yaw is degrees clockwise from south in Bedrock, and the head follows the body
        // unless something else is turning it.
        bot.yaw = (this.headingRadians * 180) / Math.PI;
        bot.headYaw = bot.yaw;

        await context.send(
            new MovePlayerPacket({
                runtimeEntityId: bot.runtimeEntityId,
                position: { ...bot.position },
                pitch: bot.pitch,
                yaw: bot.yaw,
                headYaw: bot.headYaw,
                mode: MovementType.Normal,
                onGround: true,
                ridingEntityRuntimeId: 0n,
                tick: BigInt(context.tick)
            })
        );

        context.record('move');
    }
}
