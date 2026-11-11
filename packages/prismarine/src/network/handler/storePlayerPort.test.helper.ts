import type { StorePlayer } from '../../entity/storePlayer';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import type { StubMembers } from '../../testing/stub.test.helper';
import { stub } from '../../testing/stub.test.helper';

/**
 * The player a session double returns from `getPlayer()` for a handler that reads the player's
 * state through `storePlayerOf`: a store player double built from the members the handler reads,
 * beside the `Player` members it still calls, such as a method that posts a player event.
 * @param store - The store player's members the handler reads.
 * @param port - The `Player` members the handler calls.
 * @returns A double that satisfies the session's `getPlayer()`.
 */
export const storePlayerPort = (
    store: StubMembers<StorePlayer>,
    port: Parameters<typeof stubPlayerPort>[0] = {}
): ReturnType<typeof stubPlayerPort> => {
    const storePlayer = stub<StorePlayer>(store);
    return stubPlayerPort({ ...port, getStorePlayer: () => storePlayer });
};
