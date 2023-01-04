import Event from '../Event.js';
import type Player from '../../player/Player.js';

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

    public getPlayer(): Player {
        return this.player;
    }

    public getOperator(): boolean {
        return this.operator;
    }
}
