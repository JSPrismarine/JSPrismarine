import PlayerEvent from './PlayerEvent';
import type Player from '../../Player';

/**
 * Fired as a player's operator status is changed
 */
export default class playerToggleOperatorEvent extends PlayerEvent {
    private readonly operator: boolean;

    public constructor(player: Player, operator: boolean) {
        super(player);
        this.operator = operator;
    }

    public getOperator(): boolean {
        return this.operator;
    }
}
