import type { Vector3 } from '@jsprismarine/math';

import type PlayerSession from '../../network/PlayerSession';
import type { World } from '../../world/World';
import PlayerEvent from './PlayerEvent';

/**
 * Fired once a player moved into a world of another dimension: through a portal, a command, a
 * script or a respawn. Script `world.afterEvents.playerDimensionChange` subscribers hear it in the
 * tick's script flush.
 */
export default class PlayerDimensionChangedEvent extends PlayerEvent {
    private readonly from: World;
    private readonly fromFeet: Vector3;
    private readonly to: World;
    private readonly toFeet: Vector3;

    /**
     * @param fromFeet - Where the player's feet were in the world they left.
     * @param toFeet - Where their feet are in the world they arrived in.
     */
    public constructor(session: PlayerSession, from: World, fromFeet: Vector3, to: World, toFeet: Vector3) {
        super(session);
        this.from = from;
        this.fromFeet = fromFeet;
        this.to = to;
        this.toFeet = toFeet;
    }

    /** The world the player left. */
    public getFrom(): World {
        return this.from;
    }

    /** Where the player's feet were in the world they left. */
    public getFromFeet(): Vector3 {
        return this.fromFeet;
    }

    /** The world the player arrived in. */
    public getTo(): World {
        return this.to;
    }

    /** Where the player's feet are in the world they arrived in. */
    public getToFeet(): Vector3 {
        return this.toFeet;
    }
}
