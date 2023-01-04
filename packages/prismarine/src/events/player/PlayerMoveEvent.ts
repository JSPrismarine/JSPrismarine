import Event from '../Event.js';
import MovementType from '../../network/type/MovementType.js';
import type Player from '../../Player.js';
import Vector3 from '../../math/Vector3.js';

/**
 * Fired just before a player moves
 */
export default class PlayerMoveEvent extends Event {
    private readonly player;
    private readonly from: Vector3;
    private readonly to: Vector3;
    private readonly mode: MovementType;

    public constructor(player: Player, to: Vector3, mode: MovementType = MovementType.Normal) {
        super();
        this.player = player;

        this.from = new Vector3(player.getX(), player.getY(), player.getZ());
        this.to = to;
        this.mode = mode;
    }

    public getPlayer(): Player {
        return this.player;
    }

    public getFrom(): Vector3 {
        return this.from;
    }

    public getTo(): Vector3 {
        return this.to;
    }

    public getMode(): MovementType {
        return this.mode;
    }
}
