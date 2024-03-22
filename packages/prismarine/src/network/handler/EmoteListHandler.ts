import type EmoteListPacket from '../packet/EmoteListPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerSession } from '@';
import type Server from '../../Server';

export default class EmoteListHandler implements PacketHandler<EmoteListPacket> {
    public static NetID = Identifiers.EmoteListPacket;

    public handle(_packet: EmoteListPacket, _server: Server, _session: PlayerSession): void {
        // TODO: stub
    }
}
