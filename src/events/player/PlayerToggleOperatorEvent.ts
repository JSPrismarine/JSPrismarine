import Event from '../Event';
import type Player from '../../player/Player';

/**
 * Fired as a player's operator status is changed
 */
export default class playerToggleOperatorEvent extends Event {
    private readonly player;
    private readonly operator: boolean;

    public constructor(player: Player, operator: boolean) {
        super();
        this.player = player;
        this.operator = operator;
    }

    getPlayer(): Player {
        return this.player;
    }

    getOperator(): boolean {
        return this.operator;
    }
}
