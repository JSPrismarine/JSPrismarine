import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import type TickSyncPacket from '../packet/tick-sync';

export default class TickSyncHandler {
    static NetID = Identifiers.TickSyncPacket;

    static handle(packet: TickSyncPacket, server: Prismarine, player: Player) {}
}
