import type { Vector3 } from '@jsprismarine/math';
import type Player from '../../Player';
import MovementType from '../../network/type/MovementType';
import { Event } from '../Event';

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

        this.from = player.getPosition();
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
