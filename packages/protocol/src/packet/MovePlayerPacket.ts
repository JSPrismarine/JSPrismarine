import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { movePlayerPacket } from '../wire/definitions/movement';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { MovePlayerPayload } from '../wire/definitions/movement';

/**
 * `Position Mode`, which tells the client how to apply this move.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/move-player-packet/
 */
export enum PositionMode {
    /** Ordinary movement. Clients also send this mode to the server. */
    Normal,
    /** Places the player at the spawn position. Sent by the server. */
    Respawn,
    /** Moves the player to a new location; carries `Teleportation Cause` and `Source Actor Type`. */
    Teleport,
    /** Updates the head rotation while the player is in a vehicle. */
    OnlyHeadRot
}

/**
 * A player's position, rotation, movement mode, and input tick.
 *
 * `teleportData` is the docs' Teleport Data: `null` unless `mode` is {@link PositionMode.Teleport}.
 */
export type MovePlayer = MovePlayerPayload;

/**
 * Where a player is, as the server tells a client.
 *
 * Protocol 2193 wire order, with the field names Mojang's docs use: Player Runtime ID
 * (varuint64), Position (three LE floats), Rotation (pitch then yaw, LE floats), Y-Head
 * Rotation (LE float), Position Mode (uint8: 0 Normal, 1 Respawn, 2 Teleport, 3 OnlyHeadRot),
 * On Ground (bool), Riding Runtime ID (varuint64), Teleport Data (optional), Tick (varuint64).
 *
 * Teleport Data is an optional with a presence byte of its own, which the client only sets
 * when Position Mode is Teleport. When present it is Teleportation Cause and Source Actor
 * Type, both int32 LE. A reader that skips the presence byte takes it for the first byte of
 * the tick. The wire layout lives in the declarative definition this class walks. The encoder
 * sets the presence byte from the mode, so it is 0x01 exactly for a teleport. The decoder takes
 * the byte as it finds it and reads Teleport Data whenever it is set, whatever the mode says.
 *
 * A client has not moved with one of these since 1.21.80, and protocol 818 removed the
 * movement mode that did. It sends `PlayerAuthInput` every tick and receives this. Both
 * directions are still read and written: the client package reads the server's teleports, and
 * the server decodes a client's one to drop it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/move-player-packet/
 */
export default class MovePlayerPacket extends NetworkPacket<MovePlayer> {
    public get id(): number {
        return PacketIdentifier.MOVE_PLAYER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MovePlayer): void {
        // The docs say Teleport Data is "Present only when Position Mode is Teleport", so the
        // mode decides the presence byte. Teleport Data on any other mode never reaches the wire,
        // and a teleport that carries none writes zeros for both fields.
        const teleportData =
            data.mode === PositionMode.Teleport ? (data.teleportData ?? { cause: 0, sourceActorType: 0 }) : null;
        layoutAt(movePlayerPacket, this.codecProtocol).encode(stream, { ...data, teleportData });
    }

    protected deserializePayload(stream: NetworkBinaryStream): MovePlayer {
        return layoutAt(movePlayerPacket, this.codecProtocol).decode(stream);
    }
}
