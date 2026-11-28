import BlockPosition from '../../world/BlockPosition';
import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { blockTargetRejection } from './BlockTarget';

/** The three anvils, from new to one hit from breaking. */
const ANVILS: ReadonlySet<string> = new Set(['minecraft:anvil', 'minecraft:chipped_anvil', 'minecraft:damaged_anvil']);

/**
 * The player's anvil screen asked for the anvil to wear down.
 *
 * A request whose position is not an anvil within reach in a loaded chunk is dropped at verbose
 * level. The rest are recorded at debug level and dropped too. Known gap: anvil use is not
 * modeled, so the block is neither chipped nor broken.
 */
export default class DamageAnvilHandler implements IntentHandler<'damageAnvil'> {
    public static readonly Kind = 'damageAnvil';

    /** Checks the position names an anvil in reach, then logs it. */
    public handle({ position }: Intent<'damageAnvil'>, { session, log }: SessionContext): void {
        const where = `${position.x}, ${position.y}, ${position.z}`;
        const rejection = blockTargetRejection(session, new BlockPosition(position.x, position.y, position.z), ANVILS);
        if (rejection !== null) {
            log.verbose(`Dropped an anvil damage request from ${session.identity.name} at ${where}: ${rejection}`);
            return;
        }

        log.debug(`${session.identity.name} asked to damage the anvil at ${where}. Anvils are not modeled`);
    }
}
