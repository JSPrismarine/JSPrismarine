import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface SetLocalPlayerAsInitialized {
    runtimeEntityId: bigint;
}

/**
 * The client announcing it has finished loading and is standing in the world.
 *
 * The last step of a join: until this arrives the server has a player nobody can see, and
 * chunk streaming and entity tracking are both keyed off it.
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
