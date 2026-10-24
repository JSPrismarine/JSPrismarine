import { NetworkUtil } from '../NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * A `PackIdVersion`: the `Pack UUID` as two little-endian uint64 halves, then the
 * `Pack Version` string.
 */
export interface PackIdVersion {
    /** `Most Significant Bits` of the uuid. */
    uuidMostSignificant: bigint;
    /** `Least Significant Bits` of the uuid. */
    uuidLeastSignificant: bigint;
    /** The semantic version string, for example "1.2.3". */
    version: string;
}

/** One `PackInfoData` entry of the `Resource Packs` list. */
export interface ResourcePackEntry {
    /** `Pack Id Version`. */
    id: PackIdVersion;
    /** `Pack Size` in bytes. */
    size: bigint;
    /** `Content Key`, the decryption key for an encrypted pack. Empty for an unencrypted one. */
    contentKey: string;
    /** `Subpack Name`. Empty when no subpack is selected. */
    subPackName: string;
    /** `Content Identity`, the marketplace identity string. */
    contentIdentity: string;
    /** `Has Scripts`. */
    hasScripts: boolean;
    /** `Is Addon Pack`. */
    isAddonPack: boolean;
    /** `Is Ray Tracing Capable`. */
    isRayTracingCapable: boolean;
    /** `CDN URL` the client may download the pack from. Empty when the server serves the chunks. */
    cdnUrl: string;
}

/**
 * Tells the client which resource packs it has to download before joining.
 *
 * Protocol 2193 layout, in wire order: `Resource Pack Required`, `Has Addon Packs`,
 * `Has Scripts` and `Force Disable Vibrant Visuals` as one byte each, then
 * `World Template Id And Version` as a {@link PackIdVersion}, then `Resource Packs` as a
 * varuint32 count followed by one {@link ResourcePackEntry} per pack. Each entry is its
 * `Pack Id Version`, `Pack Size` as a little-endian uint64, `Content Key`, `Subpack Name`,
 * `Content Identity`, the `Has Scripts`, `Is Addon Pack` and `Is Ray Tracing Capable` bytes,
 * then `CDN URL`. Strings are a varuint32 byte length followed by UTF-8.
 *
 * The fourth flag and the world template arrived at 2168; a reader without them takes the
 * flag for the start of the template and drops the connection.
 */
export default class ResourcePacksInfoPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePacksInfoPacket;

    public resourcePackRequired!: boolean;
    public hasAddonPacks!: boolean;
    public hasScripts!: boolean;
    /** Turns deferred rendering off for the session, whatever the client would prefer. */
    public forceDisableVibrantVisuals = false;
    /** The template this world came from. All zeroes and an empty version when it came from none. */
    public worldTemplate: PackIdVersion = { uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' };
    public resourcePackEntries: ResourcePackEntry[] = [];

    private writeId(id: PackIdVersion): void {
        this.writeUnsignedLongLE(id.uuidMostSignificant);
        this.writeUnsignedLongLE(id.uuidLeastSignificant);
        NetworkUtil.writeString(this, id.version);
    }

    private readId(): PackIdVersion {
        return {
            uuidMostSignificant: this.readUnsignedLongLE(),
            uuidLeastSignificant: this.readUnsignedLongLE(),
            version: NetworkUtil.readString(this)
        };
    }

    /** Writes the flags, the world template, then every pack entry in the order the docs list them. */
    public encodePayload(): void {
        this.writeBoolean(this.resourcePackRequired);
        this.writeBoolean(this.hasAddonPacks);
        this.writeBoolean(this.hasScripts);
        this.writeBoolean(this.forceDisableVibrantVisuals);
        this.writeId(this.worldTemplate);

        this.writeUnsignedVarInt(this.resourcePackEntries.length);
        for (const entry of this.resourcePackEntries) {
            this.writeId(entry.id);
            this.writeUnsignedLongLE(entry.size);
            NetworkUtil.writeString(this, entry.contentKey);
            NetworkUtil.writeString(this, entry.subPackName);
            NetworkUtil.writeString(this, entry.contentIdentity);
            this.writeBoolean(entry.hasScripts);
            this.writeBoolean(entry.isAddonPack);
            this.writeBoolean(entry.isRayTracingCapable);
            NetworkUtil.writeString(this, entry.cdnUrl);
        }
    }

    /** Reads the same layout back, replacing any entries the packet already held. */
    public decodePayload(): void {
        this.resourcePackRequired = this.readBoolean();
        this.hasAddonPacks = this.readBoolean();
        this.hasScripts = this.readBoolean();
        this.forceDisableVibrantVisuals = this.readBoolean();
        this.worldTemplate = this.readId();

        this.resourcePackEntries = [];
        let count = this.readUnsignedVarInt();
        while (count-- > 0) {
            this.resourcePackEntries.push({
                id: this.readId(),
                size: this.readUnsignedLongLE(),
                contentKey: NetworkUtil.readString(this),
                subPackName: NetworkUtil.readString(this),
                contentIdentity: NetworkUtil.readString(this),
                hasScripts: this.readBoolean(),
                isAddonPack: this.readBoolean(),
                isRayTracingCapable: this.readBoolean(),
                cdnUrl: NetworkUtil.readString(this)
            });
        }
    }
}
