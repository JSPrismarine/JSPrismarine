import PlayerEvent from './PlayerEvent';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired as the player toggle sprinting
 */
export default class PlayerToggleSprintEvent extends PlayerEvent {
    private readonly sprinting: boolean;

    public constructor(session: PlayerSession, sprinting: boolean) {
        super(session);
        this.sprinting = sprinting;
    }

    public getIsSprinting(): boolean {
        return this.sprinting;
    }
}
