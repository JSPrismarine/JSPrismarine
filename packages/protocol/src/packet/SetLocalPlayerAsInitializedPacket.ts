import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The payload of {@link SetLocalPlayerAsInitializedPacket}. */
export interface SetLocalPlayerAsInitialized {
    /** `Player ID`: the runtime id the server gave the player in `StartGame`. */
    runtimeEntityId: bigint;
}

/**
 * The client announcing it has finished loading and is standing in the world.
 *
 * Protocol 2193 layout, in wire order: `Player ID` as an `ActorRuntimeID`, which is one
 * varuint64. Nothing else follows it.
 *
 * The last step of a join: until this arrives the server has a player nobody can see, and
 * chunk streaming and entity tracking are both keyed off it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-local-player-as-initialized-packet/
 */
export default class SetLocalPlayerAsInitializedPacket extends NetworkPacket<SetLocalPlayerAsInitialized> {
    public get id(): number {
        return PacketIdentifier.SET_LOCAL_PLAYER_AS_INITIALIZED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetLocalPlayerAsInitialized): void {
        stream.writeUnsignedVarLong(data.runtimeEntityId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetLocalPlayerAsInitialized {
        return { runtimeEntityId: stream.readUnsignedVarLong() };
    }
}
