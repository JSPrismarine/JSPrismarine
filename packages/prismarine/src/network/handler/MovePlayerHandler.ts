import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import PlayerMoveEvent from '../../events/player/PlayerMoveEvent';
import type MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import type PacketHandler from './PacketHandler';
import type { PlacedPlayer } from './playerPorts';

/**
 * The player as a client's move reads and writes it. The move event, the reset of a canceled move
 * and the broadcast take `session.getPlayer()`, since each takes a legacy player or its actor.
 */
interface MovedPlayer extends PlacedPlayer {
    readonly pitch: number;
    readonly yaw: number;
    readonly headYaw: number;
    isOnGround(): boolean;
    /** Moves the player where its client says it is, telling nobody when `broadcast` is false. */
    setPlayerPosition(
        pose: { position: Vector3; pitch: number; yaw: number; headYaw: number },
        broadcast: boolean
    ): Promise<void>;
    /** Records whether the player stands on the ground, landing it when it comes down. */
    setOnGround(onGround: boolean): Promise<void>;
}

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

/**
 * Applies a position the client reported, and shows the move to everyone who can see it.
 *
 * One function for the two packets that carry one: `MovePlayerPacket`, which the bot harness
 * still sends, and `PlayerAuthInputPacket`, which every real client sends since 1.21.80. The
 * server does not simulate movement, so the client's word is taken - through the move event,
 * which is the one place a plugin can say no.
 */
export const applyClientMovement = async (
    server: Server,
    session: PlayerSession,
    movement: ClientMovement
): Promise<void> => {
    const player: MovedPlayer = session.getPlayer();

    // A report from before a teleport the client has not handled yet would undo the teleport.
    if (session.holdsMovementForTeleport(movement.position, movement.handledTeleport ?? false)) {
        server
            .getLogger()
            .debug(
                `Dropped a position from ${session.identity.name} sent before its teleport`,
                'MovePlayerHandler/applyClientMovement'
            );
        return;
    }

    // Keep the per-input plugin event cadence stable; unchanged poses only skip state and network work.
    const event = new PlayerMoveEvent(session.getPlayer(), movement.position, movement.mode ?? PositionMode.Normal);
    server.post(['playerMove', event]);
    if (event.isCanceled()) {
        // Since we're canceling the event, we should reset the player's position.
        await session.sendMove(session.getPlayer(), PositionMode.Respawn);
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
        await player.setPlayerPosition(
            {
                position: movement.position,
                pitch: movement.pitch,
                yaw: movement.yaw,
                headYaw: movement.headYaw
            },
            false
        );
    }

    if (groundChanged) await player.setOnGround(movement.onGround);

    if (groundChanged) {
        // Position queues a snapshot before landing logic updates the on-ground bit. Replacing
        // that entry gives observers the final pose and ground state in the one tick update.
        await player.getWorld().broadcastMove(session.getPlayer());
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
export default class MovePlayerHandler implements PacketHandler<MovePlayerPacket> {
    public static PacketName = 'MovePlayerPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    public async handle(packet: MovePlayerPacket, server: Server, session: PlayerSession): Promise<void> {
        const data = packet.getPacketData();

        if (data === null) return;

        const { name } = session.identity;
        if (data.runtimeEntityId !== session.runtimeId) {
            server.getLogger().debug(`${name} sent a MovePlayer for runtime id ${data.runtimeEntityId}, dropped`);
            return;
        }

        if (!CLIENT_MODES.has(data.mode)) {
            server.getLogger().debug(`${name} sent a MovePlayer in mode ${data.mode}, dropped`);
            return;
        }

        // `Tick` is the docs' `PlayerInputTick`, the same one a `PlayerAuthInputPacket` carries.
        // Recorded before the move is applied, so a reset for this very move echoes it.
        session.recordInputTick(data.tick);

        await applyClientMovement(server, session, {
            position: new Vector3(data.position.x, data.position.y, data.position.z),
            pitch: data.pitch,
            yaw: data.yaw,
            headYaw: data.headYaw,
            onGround: data.onGround,
            mode: data.mode
        });
    }
}
