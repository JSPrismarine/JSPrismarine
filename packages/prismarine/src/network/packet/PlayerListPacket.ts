import type BinaryStream from '@jsprismarine/binaryutils';
import { BuildPlatform } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../../network/NetworkUtil';
import type UUID from '../../utils/UUID';
import type Skin from '../../utils/skin/Skin';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** The fields of one player list entry. A Remove entry needs only `uuid`. */
interface PlayerListData {
    uuid: UUID;
    /** Written as the entry's Actor Unique ID. The server gives a player one id for both roles. */
    runtimeId?: bigint | null;
    name?: string | null;
    xuid?: string;
    platformChatId?: string | null;
    buildPlatform?: number | null;
    skin?: Skin | null;
    isTeacher?: boolean;
    isHost?: boolean;
    isSubClient?: boolean;
    /** Player Color as an ARGB integer. Defaults to white. */
    color?: number;
}

/** White. The client tints the name with this, and nothing here has an opinion about it. */
const DEFAULT_PLAYER_COLOR = 0xff_ff_ff_ff;

/**
 * One player in a Player List packet.
 *
 * The packet writes the UUID itself. For an Add entry, `networkSerialize` writes the rest of the
 * PlayerListAddEntry fields after it.
 */
export class PlayerListEntry {
    private readonly uuid: UUID;
    private readonly runtimeId: bigint | null;
    private readonly name: string | null;
    private readonly xuid: string;
    private readonly platformChatId: string | null;
    private readonly buildPlatform: number | null;
    private readonly skin: Skin | null;
    private readonly teacher: boolean;
    private readonly host: boolean;
    private readonly subClient: boolean;
    private readonly color: number;

    public constructor({
        uuid,
        runtimeId,
        name,
        xuid = '',
        platformChatId,
        buildPlatform,
        skin,
        isTeacher = true,
        isHost = true,
        isSubClient = false,
        color = DEFAULT_PLAYER_COLOR
    }: PlayerListData) {
        this.uuid = uuid;
        this.runtimeId = runtimeId ?? null;
        this.name = name ?? null;
        this.xuid = xuid;
        this.platformChatId = platformChatId ?? null;
        this.buildPlatform = buildPlatform ?? null;
        this.skin = skin ?? null;
        this.teacher = isTeacher;
        this.host = isHost;
        this.subClient = isSubClient;
        // Signed, so the int32 writer accepts an ARGB value with the alpha bit set.
        this.color = color | 0;
    }

    /**
     * Writes the PlayerListAddEntry fields that follow the UUID, in wire order: Actor Unique ID
     * (varint64, ZigZag), Player Name, XBL XUID, Platform Online ID, Build Platform (int32,
     * little-endian), Serialized Skin, Is Teacher, Is Host, Is SubClient and Player Color (int32,
     * little-endian).
     *
     * @throws Error when the entry has no skin. An Add entry cannot be written without one.
     */
    public networkSerialize(stream: BinaryStream): void {
        const skin = this.getSkin();
        if (skin === null) {
            throw new Error(`Player list entry ${this.getUUID().toString()} has no skin, so it cannot be added`);
        }

        stream.writeVarLong(this.getRuntimeId() ?? 0n);
        NetworkUtil.writeString(stream, this.getName() ?? '');
        NetworkUtil.writeString(stream, this.getXUID());
        NetworkUtil.writeString(stream, this.getPlatformChatId() ?? '');
        stream.writeIntLE(this.getBuildPlatform() ?? BuildPlatform.UNKNOWN);
        skin.networkSerialize(stream);
        stream.writeBoolean(this.isTeacher());
        stream.writeBoolean(this.isHost());
        stream.writeBoolean(this.isSubClient());
        // Player Color is an int32 in little-endian byte order, so an ARGB integer lands on the
        // wire as B, G, R, A.
        stream.writeIntLE(this.getColor());
    }

    /**
     * A copy of this entry carrying another skin, every other field unchanged.
     *
     * The session manager keeps the entry it sends to whoever joins later, so a skin change
     * mid-session needs a new entry rather than a mutation of one shared with packets already
     * built from it.
     */
    public withSkin(skin: Skin): PlayerListEntry {
        return new PlayerListEntry({
            uuid: this.uuid,
            runtimeId: this.runtimeId,
            name: this.name,
            xuid: this.xuid,
            platformChatId: this.platformChatId,
            buildPlatform: this.buildPlatform,
            skin,
            isTeacher: this.teacher,
            isHost: this.host,
            isSubClient: this.subClient,
            color: this.color
        });
    }

    public getUUID(): UUID {
        return this.uuid;
    }

    public getRuntimeId(): bigint | null {
        return this.runtimeId;
    }

    public getName(): string | null {
        return this.name;
    }

    public getXUID(): string {
        return this.xuid;
    }

    public getPlatformChatId(): string | null {
        return this.platformChatId;
    }

    public getBuildPlatform(): number | null {
        return this.buildPlatform;
    }

    public getSkin(): Skin | null {
        return this.skin;
    }

    public isTeacher(): boolean {
        return this.teacher;
    }

    public isHost(): boolean {
        return this.host;
    }

    /** Whether the player is a split-screen sub client of another player's device. */
    public isSubClient(): boolean {
        return this.subClient;
    }

    /** The Player Color as a signed 32-bit ARGB integer. */
    public getColor(): number {
        return this.color;
    }
}

/**
 * The Action byte of a player list entry: 0 adds a player, 1 removes one.
 *
 * The 1.26.50 docs page lists both values as 0. The client reads Add as 0 and Remove as 1, and
 * the 1.26.60 page corrects the table. The variant selector written before the byte is numbered
 * the other way round: Add selects 1 and Remove selects 0.
 */
export enum PlayerListAction {
    TYPE_ADD,
    TYPE_REMOVE
}

/**
 * Player List (packet 63). Adds players to or removes them from the client's player list.
 *
 * The payload is a varuint entry count followed by one entry per player. Each entry is a varuint
 * variant selector (1 for an Add entry, 0 for a Remove entry), the Action as a uint8, and the
 * UUID. An Add entry continues with the fields `PlayerListEntry.networkSerialize` writes. The
 * trusted-skin flag lives inside the skin, so nothing follows the entries.
 */
export default class PlayerListPacket extends DataPacket {
    public static NetID = Identifiers.PlayerListPacket;

    public entries: PlayerListEntry[] = [];
    public type!: number;

    public encodePayload(): void {
        const adding = this.type === PlayerListAction.TYPE_ADD;

        this.writeUnsignedVarInt(this.entries.length);
        for (const entry of this.entries) {
            this.writeUnsignedVarInt(adding ? 1 : 0);
            this.writeByte(this.type);

            entry.getUUID().networkSerialize(this);
            if (adding) entry.networkSerialize(this);
        }
    }
}
