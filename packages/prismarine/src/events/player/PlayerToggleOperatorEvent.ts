import PlayerEvent from './PlayerEvent';
import type { PlayerEventSubject } from './PlayerEvent';

/**
 * Fired as a player's operator status is changed
 */
export default class playerToggleOperatorEvent extends PlayerEvent {
    private readonly operator: boolean;

    public constructor(subject: PlayerEventSubject, operator: boolean) {
        super(subject);
        this.operator = operator;
    }

    public getOperator(): boolean {
        return this.operator;
    }
}
