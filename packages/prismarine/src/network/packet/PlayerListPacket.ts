import type BinaryStream from '@jsprismarine/binaryutils';
import { NetworkUtil } from '../../network/NetworkUtil';
import type UUID from '../../utils/UUID';
import type Skin from '../../utils/skin/Skin';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

interface PlayerListData {
    uuid: UUID;
    runtimeId?: bigint | null;
    name?: string | null;
    xuid?: string;
    platformChatId?: string | null;
    buildPlatform?: number | null;
    skin?: Skin | null;
    isTeacher?: boolean;
    isHost?: boolean;
    isSubClient?: boolean; // TODO
}

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

    public constructor({
        uuid,
        runtimeId,
        name,
        xuid = '',
        platformChatId,
        buildPlatform,
        skin,
        isTeacher = true,
        isHost = true
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
    }

    public networkSerialize(stream: BinaryStream): void {
        stream.writeVarLong(this.getRuntimeId()!);
        NetworkUtil.writeString(stream, this.getName()!);
        NetworkUtil.writeString(stream, this.getXUID()!);
        NetworkUtil.writeString(stream, this.getPlatformChatId()!);
        stream.writeIntLE(this.getBuildPlatform()!);
        this.getSkin()!.networkSerialize(stream);
        stream.writeBoolean(this.isTeacher());
        stream.writeBoolean(this.isHost());
        stream.writeBoolean(false); // is sub client
        // The colour the client tints this player's name with, ARGB and big endian. New at
        // 2168, and four bytes the entry after this one is read from without it.
        stream.writeInt(PLAYER_COLOUR);
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
}

/** White: the client tints a name with this, and nothing here has an opinion about it. */
const PLAYER_COLOUR = 0xff_ff_ff_ff | 0;

export enum PlayerListAction {
    TYPE_ADD,
    TYPE_REMOVE
}

export default class PlayerListPacket extends DataPacket {
    public static NetID = Identifiers.PlayerListPacket;

    public entries: PlayerListEntry[] = [];
    public type!: number;

    public encodePayload(): void {
        // Every entry says for itself whether it is an addition or a removal. 748 said it once
        // for the packet and then wrote a trailing run of booleans after the entries; at 2168
        // the action is a tagged variant on each entry, and there are no trailing booleans.
        const adding = this.type === PlayerListAction.TYPE_ADD;

        this.writeUnsignedVarInt(this.entries.length);
        for (const entry of this.entries) {
            // The selector, then the same action as a byte - the alternative's own first
            // field. The two are numbered opposite ways round: `Add` selects 1 and is 0.
            this.writeUnsignedVarInt(adding ? 1 : 0);
            this.writeByte(this.type);

            entry.getUUID().networkSerialize(this);
            if (adding) entry.networkSerialize(this);
        }
    }
}
