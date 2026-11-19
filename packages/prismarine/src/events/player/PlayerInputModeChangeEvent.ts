import type { InputMode } from '@jsprismarine/protocol';

import type PlayerSession from '../../network/PlayerSession';
import PlayerEvent from './PlayerEvent';

/**
 * Fired when a player's input reports another input mode than the input before it, as when they
 * put down the mouse and pick up a gamepad. Script `world.afterEvents.playerInputModeChange`
 * subscribers hear it in the tick's script flush.
 */
export default class PlayerInputModeChangeEvent extends PlayerEvent {
    private readonly previous: InputMode;
    private readonly next: InputMode;

    public constructor(session: PlayerSession, previous: InputMode, next: InputMode) {
        super(session);
        this.previous = previous;
        this.next = next;
    }

    /** The input mode before. */
    public getPrevious(): InputMode {
        return this.previous;
    }

    /** The input mode now. */
    public getNext(): InputMode {
        return this.next;
    }
}
