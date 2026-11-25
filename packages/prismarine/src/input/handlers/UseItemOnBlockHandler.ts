import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';

import { MAX_BLOCK_TARGET_DISTANCE } from './BlockTarget';
import { contentUseOnBlock } from './contentUseOnBlock';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player used the item in hand on a block: the block's and the item's behaviors get the
 * click, and the block in hand goes down when neither takes it. What is placed is the item the
 * server has in the player's hand, not what the client believes it holds.
 */
export default class UseItemOnBlockHandler implements IntentHandler<'useItemOnBlock'> {
    public static readonly Kind = 'useItemOnBlock';

    /** Offers the click to the content, for a block within reach in a loaded chunk. */
    public handle(intent: Intent<'useItemOnBlock'>, context: InputContext): undefined {
        const { session, log } = context;
        const { position, face, faceLocation } = intent;
        // A spectator touches nothing, as it breaks nothing.
        if (session.getPlayer().gamemode === Gametype.SPECTATOR) return;

        const distance = session
            .getPlayer()
            .getPosition()
            .distanceTo(new Vector3(position.x, position.y, position.z));
        if (!Number.isFinite(distance) || distance > MAX_BLOCK_TARGET_DISTANCE) {
            log.verbose(`Dropped a use on a block ${distance.toFixed(1)} away from ${session.identity.name}`);
            return;
        }
        // Only in a chunk the world already holds, as ADR 0014 has an input do.
        if (session.getWorld().getLoadedChunk(position.x >> 4, position.z >> 4) === null) {
            log.verbose(`Dropped a use on a block in a chunk that is not loaded from ${session.identity.name}`);
            return;
        }
        contentUseOnBlock(context, session, { position, face, faceLocation });
    }
}
