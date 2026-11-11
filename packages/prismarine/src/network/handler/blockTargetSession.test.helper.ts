import type { StorePlayer } from '../../entity/storePlayer';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { sessionNamedNearBlocks } from '../../testing/namedBlockTarget.test.helper';
import type { StubMembers } from '../../testing/stub.test.helper';

/**
 * {@link sessionNamedNearBlocks} whose session also answers where its player's eyes are, which with
 * its world is what `blockTargetRejection` reads of the sender. The eyes are the player double's,
 * at the origin.
 * @param blocks - Block names by `"x,y,z"` position inside the origin chunk.
 * @param player - Members to add to or replace on the player.
 * @returns What `sessionNamedNearBlocks` returns, and a read-lane handler's context over its
 *   session whose log keeps the lines in `logged`.
 */
export const sessionSeeingBlocks = (blocks: Record<string, string>, player: StubMembers<StorePlayer> = {}) => {
    const near = sessionNamedNearBlocks(blocks, player);
    // The session is a plain double, so the answer is assigned the way the identity is.
    Object.assign(near.session, { getViewPosition: () => near.player.getPosition() });
    return { ...near, context: sessionContext(near.session, { log: near.server.getLogger() }) };
};
