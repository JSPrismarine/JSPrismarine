import type Player from '../../Player';
import { sessionPlayerRefOf } from '../../network/sessionPlayers';
import type { SessionPlayerRef } from '../../network/sessionPlayers';
import type { PlayerIdentity } from '../../playerIdentity';
import { Event } from '../Event';

/**
 * An event about one player.
 *
 * It names the player by its runtime id and the identity it logged in with, which a session holds
 * too and which stay right once the player has left. A listener that needs to act on the player
 * still has the player object.
 */
export default class PlayerEvent extends Event {
    private readonly player: Player;
    /** Read off the player the first time a listener asks for it. */
    private ref: SessionPlayerRef | undefined;

    /**
     * @param player - The player the event is about.
     */
    public constructor(player: Player) {
        super();
        this.player = player;
    }

    /**
     * The player's runtime id, which the wire and the player's session use.
     * @returns The id.
     */
    public getRuntimeId(): bigint {
        return this.refOf().runtimeId;
    }

    /**
     * Who the player logged in as.
     * @returns The name, the XUID (empty when the login carried none) and the UUID.
     */
    public getIdentity(): PlayerIdentity {
        return this.refOf().identity;
    }

    /**
     * The player the event is about, for a listener that acts on it. To name the player, read
     * {@link PlayerEvent.getRuntimeId} or {@link PlayerEvent.getIdentity}.
     * @returns The player.
     */
    public getPlayer(): Player {
        return this.player;
    }

    private refOf(): SessionPlayerRef {
        this.ref ??= sessionPlayerRefOf(this.player);
        return this.ref;
    }
}
