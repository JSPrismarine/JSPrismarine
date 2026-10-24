import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * One bit of `Input Lock ComponentData`. Set bits name the inputs the client must ignore;
 * combine them with bitwise or.
 *
 * The docs give no enum for this field. The values follow gophertunnel master (protocol 2193),
 * which starts at bit 1 and leaves bit 3 unused.
 */
export enum ClientInputLock {
    /** No input is locked. */
    None = 0,
    /** Camera rotation. */
    Camera = 1 << 1,
    /** All movement. */
    Movement = 1 << 2,
    /** Walking in any horizontal direction. */
    LateralMovement = 1 << 4,
    /** Sneaking. */
    Sneak = 1 << 5,
    /** Jumping. */
    Jump = 1 << 6,
    /** Mounting a rideable actor. */
    Mount = 1 << 7,
    /** Dismounting. */
    Dismount = 1 << 8,
    /** Walking forward. */
    MoveForward = 1 << 9,
    /** Walking backward. */
    MoveBackward = 1 << 10,
    /** Strafing left. */
    MoveLeft = 1 << 11,
    /** Strafing right. */
    MoveRight = 1 << 12
}

/** The fields of an `UpdateClientInputLocksPacket`, in wire order. */
export interface UpdateClientInputLocks {
    /** `Input Lock ComponentData`, the full set of {@link ClientInputLock} bits now in force. */
    locks: number;
}

/**
 * Replaces the set of player inputs the client must ignore, such as camera rotation, jumping
 * or walking in one direction.
 *
 * Protocol 2193 layout: `Input Lock ComponentData` as a single varuint32 bitmask of
 * {@link ClientInputLock} values. The packet carries the whole set each time, so a bit that
 * is absent unlocks that input. Mojang's description still mentions a player position, but
 * the 2193 schema, gophertunnel master and PocketMine all stop after the bitmask.
 */
export default class UpdateClientInputLocksPacket extends NetworkPacket<UpdateClientInputLocks> {
    public get id(): number {
        return PacketIdentifier.UPDATE_CLIENT_INPUT_LOCKS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateClientInputLocks): void {
        stream.writeUnsignedVarInt(data.locks);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateClientInputLocks {
        return { locks: stream.readUnsignedVarInt() };
    }
}
