import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol';
import PlayerMoveEvent from '../../events/player/PlayerMoveEvent';
import type MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import type { HandlerServices, InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/** Where a client says its player is, and which way it is facing. */
export interface ClientMovement {
    position: Vector3;
    pitch: number;
    yaw: number;
    headYaw: number;
    onGround: boolean;
    /** What the client says the move is. Only `MovePlayerPacket` carries one; input is always a normal move. */
    mode?: PositionMode;
    /** Whether the input carries the `HandledTeleport` flag. Only `PlayerAuthInputPacket` has one. */
    handledTeleport?: boolean;
}

/**
 * The `Position Mode` values the docs allow on a packet sent to the server.
 *
 * "When sent to the server this is always 'Normal' except when in a vehicle then it's
 * 'OnlyHeadRot'." Respawn and Teleport are the server's to send; a client asking for either
 * is asking to be moved without walking there.
 */
const CLIENT_MODES: ReadonlySet<PositionMode> = new Set([PositionMode.Normal, PositionMode.OnlyHeadRot]);

/** What {@link applyClientMovement} reads of an input-lane handler's context. */
export type MovementContext = Pick<InputContext, 'session' | 'log' | 'step'> & {
    readonly services: Pick<HandlerServices, 'events'>;
};

/**
 * Applies a position the client reported, and shows the move to everyone who can see it.
 *
 * One function for the two packets that carry one: `MovePlayerPacket`, which the bot harness
 * still sends, and `PlayerAuthInputPacket`, which every real client sends since 1.21.80. The
 * server does not simulate movement, so the client's word is taken - through the move event,
 * which is the one place a plugin can say no.
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
    if (session.holdsMovementForTeleport(movement.position, movement.handledTeleport ?? false)) {
        log.debug(
            `Dropped a position from ${session.identity.name} sent before its teleport`,
            'MovePlayerHandler/applyClientMovement'
        );
        return;
    }

    // Keep the per-input plugin event cadence stable; unchanged poses only skip state and network work.
    const event = new PlayerMoveEvent(session, movement.position, movement.mode ?? PositionMode.Normal);
    services.events.post('playerMove', event);
    if (event.isCanceled()) {
        // Since we're canceling the event, we should reset the player's position.
        step.output(session.sendMove(session.shown(), PositionMode.Respawn));
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

/**
 * The client authoritative movement packet, which at protocol 2193 is client-bound only.
 *
 * The docs: "it is only intended as a client-bound packet", and a real client has not sent
 * one since 1.21.80. The bot harness still does, because it is the smaller packet and the
 * server does not simulate movement anyway. So the packet is still read, but only on the
 * docs' own terms for a server-bound one: `Player Runtime ID` "is always the id of the sending
 * player" and `Position Mode` is Normal or OnlyHeadRot. Anything else is dropped at debug
 * level, and `Teleport Data` is never read: the modes that carry it are not accepted.
 *
 * What is accepted ends up in {@link applyClientMovement}, the same as a `PlayerAuthInputPacket`.
 */
export default class MovePlayerHandler implements InputLaneHandler<MovePlayerPacket> {
    public static PacketName = 'MovePlayerPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    public handle(packet: MovePlayerPacket, context: InputContext): undefined {
        const { session, log } = context;
        const data = packet.getPacketData();

        if (data === null) return;

        const { name } = session.identity;
        if (data.runtimeEntityId !== session.runtimeId) {
            log.debug(`${name} sent a MovePlayer for runtime id ${data.runtimeEntityId}, dropped`);
            return;
        }

        if (!CLIENT_MODES.has(data.mode)) {
            log.debug(`${name} sent a MovePlayer in mode ${data.mode}, dropped`);
            return;
        }

        // `Tick` is the docs' `PlayerInputTick`, the same one a `PlayerAuthInputPacket` carries.
        // Recorded before the move is applied, so a reset for this very move echoes it.
        session.recordInputTick(data.tick);

        applyClientMovement(context, {
            position: new Vector3(data.position.x, data.position.y, data.position.z),
            pitch: data.pitch,
            yaw: data.yaw,
            headYaw: data.headYaw,
            onGround: data.onGround,
            mode: data.mode
        });
    }
}
