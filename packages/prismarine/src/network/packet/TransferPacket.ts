import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The `gatheringsConfig` structure carried by `TransferPacket`.
 *
 * Wire order: `experienceId` UUID, `experienceName` string, optional `worldId` UUID,
 * optional `worldName` string, `creatorId` string, optional `targetId` UUID,
 * optional `scenarioId` string, optional `serverId` string. Each optional field is a
 * presence byte followed by the value when the byte is `1`.
 */
export interface GatheringsConfig {
    /** The unique identifier for the experience. */
    experienceId: UUID;
    /** The name of the experience. */
    experienceName: string;
    /** The unique identifier for the experience world. */
    worldId: UUID | null;
    /** The name of the experience world. */
    worldName: string | null;
    /** The unique identifier for the creator of the experience. */
    creatorId: string;
    /** The unique identifier for the target. */
    targetId: UUID | null;
    /** The unique identifier for the scenario. */
    scenarioId: string | null;
    /** The unique identifier for the server. */
    serverId: string | null;
}

/**
 * Sends the client to another server, or makes it leave and rejoin the current world.
 *
 * Wire order: `Server Address` string, `Server Port` uint16 little-endian, `Reload World`
 * boolean, then the optional `Gatherings Configuration` as a presence byte followed by a
 * {@link GatheringsConfig} when present.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/transfer-packet/
 */
export default class TransferPacket extends DataPacket {
    public static NetID = Identifiers.TransferPacket;

    /** The `Server Address` the client connects to. */
    public address!: string;

    /** The `Server Port` the client connects to. */
    public port!: number;

    /** Whether the client reloads the world rather than tearing it down and building it again. */
    public reloadWorld = false;

    /** The `Gatherings Configuration`, or `null` when the packet carries none. */
    public gatheringsConfig: GatheringsConfig | null = null;

    /** Reads the address, port, reload flag and the optional gatherings configuration. */
    public decodePayload(): void {
        this.address = NetworkUtil.readString(this);
        this.port = this.readUnsignedShortLE();
        this.reloadWorld = this.readBoolean();
        this.gatheringsConfig = this.readBoolean() ? this.readGatheringsConfig() : null;
    }

    /** Writes the address, port, reload flag and the optional gatherings configuration. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.address);
        this.writeUnsignedShortLE(this.port);
        this.writeBoolean(this.reloadWorld);

        this.writeBoolean(this.gatheringsConfig !== null);
        if (this.gatheringsConfig !== null) this.writeGatheringsConfig(this.gatheringsConfig);
    }

    private readGatheringsConfig(): GatheringsConfig {
        return {
            experienceId: UUID.networkDeserialize(this),
            experienceName: NetworkUtil.readString(this),
            worldId: this.readBoolean() ? UUID.networkDeserialize(this) : null,
            worldName: this.readBoolean() ? NetworkUtil.readString(this) : null,
            creatorId: NetworkUtil.readString(this),
            targetId: this.readBoolean() ? UUID.networkDeserialize(this) : null,
            scenarioId: this.readBoolean() ? NetworkUtil.readString(this) : null,
            serverId: this.readBoolean() ? NetworkUtil.readString(this) : null
        };
    }

    private writeGatheringsConfig(config: GatheringsConfig): void {
        config.experienceId.networkSerialize(this);
        NetworkUtil.writeString(this, config.experienceName);
        this.writeOptionalUUID(config.worldId);
        this.writeOptionalString(config.worldName);
        NetworkUtil.writeString(this, config.creatorId);
        this.writeOptionalUUID(config.targetId);
        this.writeOptionalString(config.scenarioId);
        this.writeOptionalString(config.serverId);
    }

    private writeOptionalUUID(uuid: UUID | null): void {
        this.writeBoolean(uuid !== null);
        if (uuid !== null) uuid.networkSerialize(this);
    }

    private writeOptionalString(value: string | null): void {
        this.writeBoolean(value !== null);
        if (value !== null) NetworkUtil.writeString(this, value);
    }
}
