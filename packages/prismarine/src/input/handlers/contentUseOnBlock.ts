import type {
    BlockInteraction,
    InteractingPlayer,
    InteractionResult,
    InteractionRotation
} from '../../item/interaction';
import { useItemOnBlock } from '../../item/interaction';
import { runContentUse } from './contentUse';
import type { HandlerLog, HandlerServices } from '../../player/context/HandlerContext';

/** What the content hooks are offered a click through: the content, its actors and the log. */
export interface ContentHooks {
    readonly services: Pick<HandlerServices, 'content' | 'contentWorld'>;
    readonly log: HandlerLog;
}

/** One click on a block: the block, the face and where on it, as {@link useItemOnBlock} takes them. */
export type BlockClick = Pick<BlockInteraction, 'position' | 'face' | 'faceLocation'>;

/**
 * One right click on a block, offered to the content hooks: the block's and the item's behavior
 * families, then the placement of the block in hand.
 *
 * @param rotation - The view the click was made with, when the client reports one apart from its movement.
 * @returns Whether a behavior family or a placement consumed the click. A behavior that throws
 *   is logged and declines, and what it wrote is undone.
 */
export const contentUseOnBlock = (
    { services, log }: ContentHooks,
    player: InteractingPlayer,
    click: BlockClick,
    rotation?: InteractionRotation
): InteractionResult => {
    const { content } = services;
    const world = player.getWorld();
    const actors = services.contentWorld.actorsAt(world.getDimension().name, world.getLevel().name);

    return runContentUse(world, log, () =>
        useItemOnBlock({ content, actors, player, ...click, ...(rotation === undefined ? {} : { rotation }) })
    );
};
