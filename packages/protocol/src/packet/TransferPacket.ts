import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import UUID from '../wire/structures/UUID';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The optional experience metadata sent with a server transfer. */
export interface GatheringsConfig {
    /** Unique identifier for the experience. */
    experienceId: UUID;
    /** Display name of the experience. */
    experienceName: string;
    /** Unique identifier for the experience world, when one is supplied. */
    worldId: UUID | null;
    /** Display name of the experience world, when one is supplied. */
    worldName: string | null;
    /** Identifier of the experience creator. */
    creatorId: string;
    /** Unique identifier of the target, when one is supplied. */
    targetId: UUID | null;
    /** Identifier of the scenario, when one is supplied. */
    scenarioId: string | null;
    /** Identifier of the destination server, when one is supplied. */
    serverId: string | null;
}

/** Data carried when sending the client to another server. */
export interface Transfer {
    /** Hostname or IP address for the destination. */
    address: string;
    /** Destination port, written as uint16 little-endian. */
    port: number;
    /** Whether the client reloads the world after the transfer. */
    reloadWorld: boolean;
    /** Additional experience metadata, or `null` when the server sends none. */
    gatheringsConfig: GatheringsConfig | null;
}

/**
 * Sends the client to another server, optionally supplying metadata for a hosted experience.
 *
 * Protocol 2193 layout: `Server Address` as a string, `Server Port` as uint16 little-endian,
 * `Reload World` as a boolean, then an optional `Gatherings Configuration`. Each optional
 * field in that configuration has its own presence boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/transfer-packet/
 */
export default class TransferPacket extends NetworkPacket<Transfer> {
    public get id(): number {
        return PacketIdentifier.TRANSFER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Transfer): void {
        stream.writeString(data.address);
        stream.writeUnsignedShortLE(data.port);
        stream.writeBoolean(data.reloadWorld);
        stream.writeBoolean(data.gatheringsConfig !== null);
        if (data.gatheringsConfig !== null) this.writeGatheringsConfig(stream, data.gatheringsConfig);
    }

    protected deserializePayload(stream: NetworkBinaryStream): Transfer {
        const address = stream.readString();
        const port = stream.readUnsignedShortLE();
        const reloadWorld = stream.readBoolean();
        const gatheringsConfig = stream.readBoolean() ? this.readGatheringsConfig(stream) : null;
        return { address, port, reloadWorld, gatheringsConfig };
    }

    private readGatheringsConfig(stream: NetworkBinaryStream): GatheringsConfig {
        return {
            experienceId: UUID.networkDeserialize(stream),
            experienceName: stream.readString(),
            worldId: stream.readBoolean() ? UUID.networkDeserialize(stream) : null,
            worldName: stream.readBoolean() ? stream.readString() : null,
            creatorId: stream.readString(),
            targetId: stream.readBoolean() ? UUID.networkDeserialize(stream) : null,
            scenarioId: stream.readBoolean() ? stream.readString() : null,
            serverId: stream.readBoolean() ? stream.readString() : null
        };
    }

    private writeGatheringsConfig(stream: NetworkBinaryStream, config: GatheringsConfig): void {
        config.experienceId.networkSerialize(stream);
        stream.writeString(config.experienceName);
        this.writeOptionalUUID(stream, config.worldId);
        this.writeOptionalString(stream, config.worldName);
        stream.writeString(config.creatorId);
        this.writeOptionalUUID(stream, config.targetId);
        this.writeOptionalString(stream, config.scenarioId);
        this.writeOptionalString(stream, config.serverId);
    }

    private writeOptionalUUID(stream: NetworkBinaryStream, uuid: UUID | null): void {
        stream.writeBoolean(uuid !== null);
        if (uuid !== null) uuid.networkSerialize(stream);
    }

    private writeOptionalString(stream: NetworkBinaryStream, value: string | null): void {
        stream.writeBoolean(value !== null);
        if (value !== null) stream.writeString(value);
    }
}
