import DataPacket from "./DataPacket";
import Identifiers from "../Identifiers";

export default class ResourcePacksInfoPacket extends DataPacket {
  public static NetID = Identifiers.ResourcePacksInfoPacket;

  public resourcePackRequired!: boolean;
  public hasAddonPacks!: boolean;
  public hasScripts!: boolean;
  public forceServerPacksEnabled!: boolean;

  public behaviorPackEntries = [];
  public resourcePackEntries = [];
  public cdnUrls = [];

  public encodePayload(): void {
    this.writeBoolean(this.resourcePackRequired);
    this.writeBoolean(this.hasAddonPacks);
    this.writeBoolean(this.hasScripts);
    this.writeBoolean(this.forceServerPacksEnabled);
    this.writeUnsignedShortLE(this.behaviorPackEntries.length);
    for (const _behaviorEntry of this.behaviorPackEntries) {
      // TODO: we don't need them for now
    }

    this.writeUnsignedShortLE(this.resourcePackEntries.length);
    for (const _resourceEntry of this.resourcePackEntries) {
      // TODO: we don't need them for now
    }

    this.writeUnsignedVarInt(this.cdnUrls.length);
    for (const _cdnUrl of this.cdnUrls) {
      // TODO: we don't need them for now
    }
  }
}
