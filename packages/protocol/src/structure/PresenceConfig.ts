import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * A `presenceConfig`: the rich presence a server asks the client to show instead of its own,
 * as `ServerPresenceInfoPacket` and `Server Configuration Join Info` (inside `StartGamePacket`)
 * carry it.
 *
 * Protocol 2193 wire order: `richPresenceId` as an optional string, a presence byte followed
 * by the string (a varuint32 byte length then UTF-8) only when set. Mojang's notes cap the id
 * at 50 characters and reject an empty one; absence means the client keeps driving its own
 * rich presence. The `mExperienceName` and `mWorldName` fields that preceded it are gone at
 * 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/presence-config/}
 */
export default class PresenceConfig extends NetworkStructure {
    public constructor(
        /** `richPresenceId`, the rich presence to show. Leave unset to let the client decide. */
        public richPresenceId?: string
    ) {
        super();
    }

    /** Writes the presence byte, then `richPresenceId` when set. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeBoolean(this.richPresenceId !== undefined);
        if (this.richPresenceId !== undefined) stream.writeString(this.richPresenceId);
    }

    /** Reads the presence byte, then `richPresenceId` when the byte says it follows. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.richPresenceId = stream.readBoolean() ? stream.readString() : undefined;
    }
}
