import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import type Skin from '../../utils/skin/Skin';
import type UUID from '../../utils/UUID';

export default class PlayerSkinPacket extends DataPacket {
    static NetID = Identifiers.PlayerSkinPacket;

    public uuid!: UUID;
    public newSkinName!: string;
    public oldSkinName!: string;
    public skin!: Skin;
    public trusted!: boolean;

    public decodePayload() {
        this.uuid = this.readUUID();
        this.readRemaining();
        // TODO this.skin = this.readSkin();
        // this.newSkinName = this.readString();
        // this.oldSkinName = this.readString();
        // this.trusted = this.readBool();
    }
}
