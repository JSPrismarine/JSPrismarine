import type { Vector3 } from '@jsprismarine/math';
import type PlayerSession from '../../player/PlayerSession';
import type { MoveMode } from '../../player/presenter/SessionPresenter';
import PlayerEvent from './PlayerEvent';

/**
 * Fired just before a player moves
 */
export default class PlayerMoveEvent extends PlayerEvent {
    private readonly from: Vector3;
    private readonly to: Vector3;
    private readonly mode: MoveMode;

    /**
     * @param session - The session of the player the event is about.
     * @param to - Where it moves to.
     * @param mode - How the client is told.
     */
    public constructor(session: PlayerSession, to: Vector3, mode: MoveMode = 'normal') {
        super(session);

        this.from = session.getViewPosition();
        this.to = to;
        this.mode = mode;
    }

    public getFrom(): Vector3 {
        return this.from;
    }

    public getTo(): Vector3 {
        return this.to;
    }

    public getMode(): MoveMode {
        return this.mode;
    }
}
