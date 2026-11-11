import type Player from '../Player';
import type { LegacyPlayerBody } from '../entity/LegacyPlayerBody';
import type { StubMembers } from './stub.test.helper';
import { stub } from './stub.test.helper';

/**
 * The player a session double returns from `getPlayer()`, built from the members of the port a
 * handler reads.
 *
 * A handler names only the part of the player it uses (`KickedPlayer`, `PlacedPlayer`,
 * `ShownPlayer` picks), but `PlayerSession.getPlayer()` still returns the whole `Player`. This is
 * the one place a port-sized double takes that type, so a handler test names the port and never
 * imports the class. Passing the port as the type argument makes the compiler check every member
 * the handler reads. The package that moves live players into the store retypes `getPlayer()`,
 * and the callers of this helper then change in one file.
 *
 * The double's body answers the same members, because a handler hands the player's body to what
 * shows it, such as a move broadcast, and the session shows its own player through its body.
 *
 * @param port - The members the handler reads. Anything else is absent on the double.
 * @returns A double that satisfies the session's `getPlayer()` and holds only those members.
 */
export const stubPlayerPort = <Port extends StubMembers<Player>>(port: Port): Player => {
    const body: LegacyPlayerBody = Object.assign(Object.create(Object.prototype), port);
    return stub<Player>({ ...port, getBody: () => body });
};
