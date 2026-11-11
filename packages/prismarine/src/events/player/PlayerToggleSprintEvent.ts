import PlayerEvent from './PlayerEvent';
import type { PlayerEventSubject } from './PlayerEvent';

/**
 * Fired as the player toggle sprinting
 */
export default class PlayerToggleSprintEvent extends PlayerEvent {
    private readonly sprinting: boolean;

    public constructor(subject: PlayerEventSubject, sprinting: boolean) {
        super(subject);
        this.sprinting = sprinting;
    }

    public getIsSprinting(): boolean {
        return this.sprinting;
    }
}
