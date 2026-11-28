import { editCommandBlock } from '@jsprismarine/block-behaviors/families/commandBlock';

import { mayEditCommandBlocks } from '../../command/commandBlockAccess';
import BlockPosition from '../../world/BlockPosition';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { blockTargetRejection } from './BlockTarget';

/** The blocks whose screen sets a command. */
const COMMAND_BLOCKS: ReadonlySet<string> = new Set([
    'minecraft:command_block',
    'minecraft:repeating_command_block',
    'minecraft:chain_command_block'
]);

/**
 * The player set a command block's command and options.
 *
 * Only an operator in creative mode may edit one, as Java's `canUseGameMasterBlocks` has it; an
 * edit from anybody else, or of a block out of reach or no longer a command block, is dropped at
 * verbose level. The block takes the mode, the command and its options, and starts when it
 * became always active.
 */
export default class EditCommandBlockHandler implements IntentHandler<'editCommandBlock'> {
    public static readonly Kind = 'editCommandBlock';

    /** Applies the edit, or drops one the sender may not make. */
    public handle({ kind: _kind, position, ...edit }: Intent<'editCommandBlock'>, context: InputContext): undefined {
        const { session, log, services } = context;
        const name = session.identity.name;
        if (!mayEditCommandBlocks(session)) {
            log.verbose(`Dropped a command block edit from ${name}: only an operator in creative mode may make one`);
            return;
        }

        const { x, y, z } = position;
        const rejection = blockTargetRejection(session, new BlockPosition(x, y, z), COMMAND_BLOCKS);
        if (rejection !== null) {
            log.verbose(`Dropped a command block edit from ${name} at ${x}, ${y}, ${z}: ${rejection}`);
            return;
        }

        const world = session.getWorld();
        editCommandBlock(
            services.content.world.blockWorld.at(world.getDimension().name, world.getLevel().name),
            position,
            edit
        );
    }
}
