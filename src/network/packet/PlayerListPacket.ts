import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Skin from '../../utils/skin/Skin';
import UUID from '../../utils/UUID';

interface PlayerListData {
    uuid: UUID;
    uniqueEntityid?: bigint | null;
    name?: string | null;
    xuid?: string;
    platformChatId?: string | null;
    buildPlatform?: number | null;
    skin?: Skin | null;
    isTeacher?: boolean;
    isHost?: boolean;
}

export class PlayerListEntry {
    private uuid: UUID;
    private uniqueEntityId: bigint | null;
    private name: string | null;
    private xuid: string;
    private platformChatId: string | null;
    private buildPlatform: number | null;
    private skin: Skin | null;
    private teacher: boolean;
    private host: boolean;

    public constructor({
        uuid,
        uniqueEntityid,
        name,
        xuid = '',
        platformChatId,
        buildPlatform,
        skin,
        isTeacher = true,
        isHost = true
    }: PlayerListData) {
        this.uuid = uuid;
        this.uniqueEntityId = uniqueEntityid ?? null;
        this.name = name ?? null;
        this.xuid = xuid;
        this.platformChatId = platformChatId ?? null;
        this.buildPlatform = buildPlatform ?? null;
        this.skin = skin ?? null;
        this.teacher = isTeacher;
        this.host = isHost;
    }

    public getUUID(): UUID {
        return this.uuid;
    }

    public getUniqueEntityId(): bigint | null {
        return this.uniqueEntityId;
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

export enum PlayerListAction {
    TYPE_ADD,
    TYPE_REMOVE
}

export default class PlayerListPacket extends DataPacket {
    static NetID = Identifiers.PlayerListPacket;

    public entries: Array<PlayerListEntry> = [];
    public type!: number;

    public encodePayload() {
        this.writeByte(this.type);
        this.writeUnsignedVarInt(this.entries.length);
        for (const entry of this.entries) {
            this.writeUUID(entry.getUUID());

            if (this.type === PlayerListAction.TYPE_ADD) {
                this.writePlayerListAddEntry(entry);
            }
        }

        if (this.type === PlayerListAction.TYPE_ADD) {
            for (let entry of this.entries) {
                this.writeBool(entry.getSkin()!.isTrusted);
            }
        }
    }
}
