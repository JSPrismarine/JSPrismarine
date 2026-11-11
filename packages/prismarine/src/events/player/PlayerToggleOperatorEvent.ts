import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired as a player's operator status is changed
 */
export default class playerToggleOperatorEvent extends PlayerEvent {
    private readonly operator: boolean;

    public constructor(session: PlayerSession, operator: boolean) {
        super(session);
        this.operator = operator;
    }

    public getOperator(): boolean {
        return this.operator;
    }
}
