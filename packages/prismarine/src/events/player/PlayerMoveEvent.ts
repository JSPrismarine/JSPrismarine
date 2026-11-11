import type { Vector3 } from '@jsprismarine/math';
import type PlayerSession from '../../network/PlayerSession';
import type { PlayerEventSubject } from './PlayerEvent';
import { PositionMode } from '@jsprismarine/protocol';
import PlayerEvent from './PlayerEvent';

/**
 * Fired just before a player moves
 */
export default class PlayerMoveEvent extends PlayerEvent {
    private readonly from: Vector3;
    private readonly to: Vector3;
    private readonly mode: PositionMode;

    /**
     * @param subject - The player that moves, as its session, or the player itself, which is
     *   where the move starts from.
     * @param to - Where it moves to.
     * @param mode - How the client is told.
     */
    public constructor(
        subject: PlayerSession | (PlayerEventSubject & { getPosition(): Vector3 }),
        to: Vector3,
        mode: PositionMode = PositionMode.Normal
    ) {
        super(subject);

        this.from = ('getPosition' in subject ? subject : subject.getPlayer()).getPosition();
        this.to = to;
        this.mode = mode;
    }

    public getFrom(): Vector3 {
        return this.from;
    }

    public getTo(): Vector3 {
        return this.to;
    }

    public getMode(): PositionMode {
        return this.mode;
    }
}
