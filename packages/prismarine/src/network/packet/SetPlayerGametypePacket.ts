import type { Gametype } from '@jsprismarine/minecraft';

import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetPlayerGametypePacket extends DataPacket {
    public static NetID = Identifiers.SetPlayerGametypePacket;

    public override getId(): number {
        return SetPlayerGametypePacket.NetID;
    }

    public override getName(): string {
        return 'SetPlayerGametypePacket';
    }

    public gametype!: Gametype;

    public decodePayload(): void {
        this.gametype = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeVarInt(this.gametype);
    }
}
