import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ResourcePacksInfoPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePacksInfoPacket;

    public mustAccept!: boolean;
    public hasScripts!: boolean;

    public behaviorPackEntries = [];
    public resourcePackEntries = [];

    public encodePayload() {
        this.writeBool(this.mustAccept);
        this.writeBool(this.hasScripts);
        this.writeLShort(this.behaviorPackEntries.length);
        for (const _behaviorEntry of this.behaviorPackEntries) {
            // TODO: we don't need them for now
        }

        this.writeLShort(this.resourcePackEntries.length);
        for (const _resourceEntry of this.resourcePackEntries) {
            // TODO: we don't need them for now
        }
    }
}
