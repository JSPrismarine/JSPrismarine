import { sessionNamedNearBlocks } from '../../testing/namedBlockTarget.test.helper';

/**
 * {@link sessionNamedNearBlocks} whose session also answers where its player's eyes are, which with
 * its world is what `blockTargetRejection` reads of the sender. The eyes are the player double's,
 * at the origin.
 * @param blocks - Block names by `"x,y,z"` position inside the origin chunk.
 * @returns What `sessionNamedNearBlocks` returns.
 */
export const sessionSeeingBlocks = (blocks: Record<string, string>) => {
    const near = sessionNamedNearBlocks(blocks);
    // The session is a plain double, so the answer is assigned the way the identity is.
    Object.assign(near.session, { getViewPosition: () => near.player.getPosition() });
    return near;
};
