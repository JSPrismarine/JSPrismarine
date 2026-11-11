import type { StorePlayer } from '../entity/storePlayer';
import type { StubMembers } from './stub.test.helper';
import { stub } from './stub.test.helper';

/**
 * The store player a session double returns from `getPlayer()`, built from the members a test's
 * code reads of it.
 *
 * Passing the members' type as the type argument makes the compiler check every member the code
 * reads. What the session itself does for its player, such as showing it or moving it, is the
 * session's, and a test drives that through a real session from `sessionFor`.
 *
 * @param port - The members the code reads. Anything else is absent on the double.
 * @returns A double that satisfies the session's `getPlayer()` and holds only those members.
 */
export const stubPlayerPort = <Port extends StubMembers<StorePlayer>>(port: Port): StorePlayer =>
    stub<StorePlayer>(port);
