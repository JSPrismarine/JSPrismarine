import type { Gametype } from '@jsprismarine/minecraft';

import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetPlayerGameTypePacket extends DataPacket {
    public static NetID = Identifiers.SetPlayerGameTypePacket;

    public gametype!: Gametype;

    public decodePayload() {
        this.gametype = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.gametype);
    }
}
