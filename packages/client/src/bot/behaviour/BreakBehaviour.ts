import { PlayerActionPacket, PlayerActionType } from '@jsprismarine/protocol';

import type { Behaviour, BehaviourContext } from './Behaviour';

/** Ticks between one break attempt and the next. */
const INTERVAL_TICKS = 40;

/** The face of the block being hit. 1 is the top, which is what you hit standing on it. */
const BLOCK_FACE_TOP = 1;

/**
 * Repeatedly starts and finishes breaking the block underfoot.
 *
 * Aimed under the bot rather than at anything in particular, because the client has no
 * terrain model yet - it does not know what is where, only where it is. The server resolves
 * the position itself, so the traffic and the work it causes are real even when the block
 * turns out to be air.
 *
 * The three-step sequence is what a real client sends, and sending only the last step is the
 * shortcut worth not taking: a server that tracks break progress would see a destroy for a
 * block nobody had started on, which is a rejection path rather than the one being measured.
 */
export default class BreakBehaviour implements Behaviour {
    public readonly name = 'break';

    public async tick(context: BehaviourContext): Promise<void> {
        if (context.tick % INTERVAL_TICKS !== 0 || context.tick === 0) return;

        const { bot } = context;
        // Under the feet: y - 1 from where the player is standing.
        const target = {
            x: Math.floor(bot.position.x),
            y: Math.max(0, Math.floor(bot.position.y) - 1),
            z: Math.floor(bot.position.z)
        };

        for (const action of [
            PlayerActionType.START_BREAK,
            PlayerActionType.CRACK_BLOCK,
            PlayerActionType.STOP_BREAK
        ]) {
            await context.send(
                new PlayerActionPacket({
                    runtimeEntityId: bot.runtimeEntityId,
                    action,
                    blockPosition: target,
                    resultPosition: target,
                    blockFace: BLOCK_FACE_TOP
                })
            );
        }

        context.record('break');
    }
}
