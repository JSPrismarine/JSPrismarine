import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ResourcePacksInfoPacket extends DataPacket {
    static NetID = Identifiers.ResourcePacksInfoPacket;

    public mustAccept = false;
    public hasScripts = false;

    public behaviorPackEntries = [];
    public resourcePackEntries = [];

    public encodePayload() {
        this.writeBool(this.mustAccept);
        this.writeBool(this.hasScripts);
        this.writeLShort(this.behaviorPackEntries.length);
        for (let _behaviorEntry of this.behaviorPackEntries) {
            // TODO: we don't need them for now
        }
        this.writeLShort(this.resourcePackEntries.length);
        for (let _resourceEntry of this.resourcePackEntries) {
            // TODO: we don't need them for now
        }
    }
}
