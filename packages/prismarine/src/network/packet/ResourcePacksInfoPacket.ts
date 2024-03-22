import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ResourcePacksInfoPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePacksInfoPacket;

    public mustAccept!: boolean;
    public hasScripts!: boolean;
    public forceAccept!: boolean;

    public behaviorPackEntries = [];
    public resourcePackEntries = [];

    public cdnUrls = [];

    public encodePayload() {
        this.writeBoolean(this.mustAccept);
        this.writeBoolean(this.hasScripts);
        this.writeBoolean(this.forceAccept);
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
