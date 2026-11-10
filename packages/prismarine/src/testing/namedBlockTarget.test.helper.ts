import type { StubMembers } from './stub.test.helper';
import type Player from '../Player';
import { sessionNearBlocks } from './blockTarget.test.helper';
import { STEVE } from './sessionIdentity.test.helper';

/**
 * {@link sessionNearBlocks} whose session also holds Steve's identity, for handlers that name the
 * player from the session instead of from the player object.
 * @param blocks - Block names by `"x,y,z"` position inside the origin chunk.
 * @param player - Members to add to or replace on the player.
 * @returns What `sessionNearBlocks` returns, its session holding {@link STEVE}.
 */
export const sessionNamedNearBlocks = (blocks: Record<string, string>, player: StubMembers<Player> = {}) => {
    const near = sessionNearBlocks(blocks, player);
    // The session is a plain double, so the identity is assigned the way a real one holds it.
    Object.assign(near.session, { identity: STEVE });
    return near;
};
