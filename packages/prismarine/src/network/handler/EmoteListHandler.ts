import type EmoteListPacket from '../packet/EmoteListPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';

export default class EmoteListHandler implements PacketHandler<EmoteListPacket> {
    public static NetID = Identifiers.EmoteListPacket;

    public handle(_packet: EmoteListPacket, _server: Server, connection: PlayerConnection): void {
        // TODO: stub
    }
}
