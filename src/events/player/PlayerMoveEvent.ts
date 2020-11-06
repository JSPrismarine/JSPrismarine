import Event from '../Event';
import type Player from '../../player/Player';
import Vector3 from '../../math/Vector3';
import MovementType from '../../network/type/MovementType';

/**
 * Fired just before a player moves
 */
export default class PlayerMoveEvent extends Event {
    private player;
    private from: Vector3;
    private to: Vector3;
    private mode: MovementType;

    constructor(
        player: Player,
        to: Vector3,
        mode: MovementType = MovementType.Normal
    ) {
        super();
        this.player = player;

        this.from = new Vector3(player.getX(), player.getY(), player.getZ());
        this.to = to;
        this.mode = mode;
    }

    getPlayer(): Player {
        return this.player;
    }
    getFrom(): Vector3 {
        return this.from;
    }
    getTo(): Vector3 {
        return this.to;
    }
    getMode(): MovementType {
        return this.mode;
    }
}
