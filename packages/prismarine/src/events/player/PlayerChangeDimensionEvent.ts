import type Player from '../../Player';
import type { Arrival } from '../../network/PlayerSession';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired just before a player leaves one world for another through a portal, with the
 * destination resolved.
 *
 * Cancelable. A canceled event leaves the player in the world they stand in, with no
 * cooldown set and nothing sent to the client. The arrival is the resolved landing place,
 * so a listener can read where the trip would end before deciding.
 */
export default class PlayerChangeDimensionEvent extends Event {
    private readonly player: Player;
    private readonly from: World;
    private readonly to: World;
    private readonly arrival: Arrival;

    public constructor(player: Player, from: World, to: World, arrival: Arrival) {
        super();

        this.player = player;
        this.from = from;
        this.to = to;
        this.arrival = arrival;
    }

    /** Who is traveling. */
    public getPlayer(): Player {
        return this.player;
    }

    /** The world the player is leaving. */
    public getFrom(): World {
        return this.from;
    }

    /** The world the player arrives in. */
    public getTo(): World {
        return this.to;
    }

    /** Where in `to` the player lands, and facing which way. */
    public getArrival(): Arrival {
        return this.arrival;
    }
}
