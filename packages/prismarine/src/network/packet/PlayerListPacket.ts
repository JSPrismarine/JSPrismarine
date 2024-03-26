import type BinaryStream from "@jsprismarine/jsbinaryutils";
import DataPacket from "./DataPacket";
import Identifiers from "../Identifiers";
import McpeUtil from "../NetworkUtil";
import type Skin from "../../utils/skin/Skin";
import type UUID from "../../utils/UUID";

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
  isSubClient?: boolean; // TODO
}

export class PlayerListEntry {
  private readonly uuid: UUID;
  private readonly uniqueEntityId: bigint | null;
  private readonly name: string | null;
  private readonly xuid: string;
  private readonly platformChatId: string | null;
  private readonly buildPlatform: number | null;
  private readonly skin: Skin | null;
  private readonly teacher: boolean;
  private readonly host: boolean;

  public constructor({
    uuid,
    uniqueEntityid,
    name,
    xuid = "",
    platformChatId,
    buildPlatform,
    skin,
    isTeacher = true,
    isHost = true,
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

  public networkSerialize(stream: BinaryStream): void {
    stream.writeVarLong(this.getUniqueEntityId()!);
    McpeUtil.writeString(stream, this.getName()!);
    McpeUtil.writeString(stream, this.getXUID()!);
    McpeUtil.writeString(stream, this.getPlatformChatId()!);
    stream.writeIntLE(this.getBuildPlatform()!);
    this.getSkin()!.networkSerialize(stream);
    stream.writeBoolean(this.isTeacher());
    stream.writeBoolean(this.isHost());
    stream.writeBoolean(false); // is sub client
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
  TYPE_REMOVE,
}

export default class PlayerListPacket extends DataPacket {
  public static NetID = Identifiers.PlayerListPacket;

  public entries: PlayerListEntry[] = [];
  public type!: number;

  public encodePayload() {
    this.writeByte(this.type);
    this.writeUnsignedVarInt(this.entries.length);
    for (const entry of this.entries) {
      entry.getUUID().networkSerialize(this);

      if (this.type === PlayerListAction.TYPE_ADD) {
        entry.networkSerialize(this);
      }
    }

    if (this.type === PlayerListAction.TYPE_ADD) {
      for (let i = 0; i < this.entries.length; i++) {
        this.writeBoolean(true);
      }
    }
  }
}
