import type Skin from '../../utils/skin/skin';
import type UUID from '../../utils/uuid';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class PlayerSkinPacket extends DataPacket {
    static NetID = Identifiers.PlayerSkinPacket;

    public uuid: UUID | null = null;
    public newSkinName: string = '';
    public oldSkinName: string = '';
    public skin: Skin | null = null;
    public trusted: boolean = false;

    public decodePayload() {
        this.uuid = this.readUUID();
        this.skin = this.readSkin();
        this.newSkinName = this.readString();
        this.oldSkinName = this.readString();
        this.trusted = this.readBool();
    }
}
