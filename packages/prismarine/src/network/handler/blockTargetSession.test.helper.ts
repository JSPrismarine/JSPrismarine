import { sessionNamedNearBlocks } from '../../testing/namedBlockTarget.test.helper';

/**
 * {@link sessionNamedNearBlocks} whose session also answers where its player's eyes are and which
 * world it is in, which is what `blockTargetRejection` reads of the sender. Both come from the
 * player double at the origin.
 * @param blocks - Block names by `"x,y,z"` position inside the origin chunk.
 * @returns What `sessionNamedNearBlocks` returns.
 */
export const sessionSeeingBlocks = (blocks: Record<string, string>) => {
    const near = sessionNamedNearBlocks(blocks);
    // The session is a plain double, so the two answers are assigned the way the identity is.
    Object.assign(near.session, {
        getViewPosition: () => near.player.getPosition(),
        getWorld: () => near.player.getWorld()
    });
    return near;
};
