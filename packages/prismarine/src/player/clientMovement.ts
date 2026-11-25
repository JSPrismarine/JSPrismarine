/**
 * A position a client reported, applied the same for both editions: a Bedrock client's
 * `PlayerAuthInput` and a Java client's move packets both arrive here.
 */
import type { Vector3 } from '@jsprismarine/math';

import PlayerMoveEvent from '../events/player/PlayerMoveEvent';
import type { HandlerServices, InputContext } from './context/HandlerContext';

/** Where a client says its player is, and which way it is facing. */
export interface ClientMovement {
    position: Vector3;
    pitch: number;
    yaw: number;
    headYaw: number;
    onGround: boolean;
    /** Whether the input carries the `HandledTeleport` flag. */
    handledTeleport: boolean;
}

/** What {@link applyClientMovement} reads of an input-lane handler's context. */
export type MovementContext = Pick<InputContext, 'session' | 'log' | 'step'> & {
    readonly services: Pick<HandlerServices, 'events'>;
};

/**
 * Applies a position the client reported in an input, and shows the move to everyone who can
 * see it.
 *
 * The server does not simulate movement, so the client's word is taken - through the move
 * event, which is the one place a plugin can say no.
 *
 * Synchronous: the move is written before the sessions' methods first wait, and what they wait
 * for is a send or the world's move queue, which go to `step.output`.
 */
export const applyClientMovement = (
    { session, log, services, step }: MovementContext,
    movement: ClientMovement
): undefined => {
    // What the move is compared with: the store player's pose. The session moves it.
    const player = session.getPlayer();

    // A report from before a teleport the client has not handled yet would undo the teleport.
    if (session.holdsMovementForTeleport(movement.position, movement.handledTeleport)) {
        log.debug(`Dropped a position from ${session.identity.name} sent before its teleport`);
        return;
    }

    // Keep the per-input plugin event cadence stable; unchanged poses only skip state and network work.
    const event = new PlayerMoveEvent(session, movement.position, 'normal');
    services.events.post('playerMove', event);
    if (event.isCanceled()) {
        // Since we're canceling the event, we should reset the player's position.
        step.output(session.sendMove(session.shown(), 'respawn'));
        return;
    }

    // Object.is distinguishes signed zero, which has a different float encoding on the wire.
    const previous = player.getPosition();
    const positionChanged =
        !Object.is(previous.getX(), movement.position.getX()) ||
        !Object.is(previous.getY(), movement.position.getY()) ||
        !Object.is(previous.getZ(), movement.position.getZ());
    const rotationChanged =
        !Object.is(player.pitch, movement.pitch) ||
        !Object.is(player.yaw, movement.yaw) ||
        !Object.is(player.headYaw, movement.headYaw);
    const groundChanged = player.isOnGround() !== movement.onGround;

    if (!positionChanged && !rotationChanged && !groundChanged) return;

    if (positionChanged || rotationChanged) {
        // The store player moves before `setPlayerPosition` first waits, on the world's move
        // queue, and it tells no client: the queue is the only wait.
        step.output(
            session.setPlayerPosition(
                {
                    position: movement.position,
                    pitch: movement.pitch,
                    yaw: movement.yaw,
                    headYaw: movement.headYaw
                },
                false
            )
        );
    }

    if (groundChanged) session.setOnGround(movement.onGround);

    if (groundChanged) {
        // Position queues a snapshot before landing logic updates the on-ground bit. Replacing
        // that entry gives observers the final pose and ground state in the one tick update.
        step.output(session.getWorld().broadcastMove(session.shown()));
    }
};
