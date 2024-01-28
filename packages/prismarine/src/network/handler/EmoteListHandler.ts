import type EmoteListPacket from '../packet/EmoteListPacket.js';
import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';

export default class EmoteListHandler implements PacketHandler<EmoteListPacket> {
    public static NetID = Identifiers.EmoteListPacket;

    public handle(_packet: EmoteListPacket, _server: Server, _session: PlayerSession): void {
        // TODO: stub
    }
}
