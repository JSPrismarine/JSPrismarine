import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket.js';

export default class SetLocalPlayerAsInitializedHandler implements PacketHandler<SetLocalPlayerAsInitializedPacket> {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public async handle(
        _packet: SetLocalPlayerAsInitializedPacket,
        _server: Server,
        _session: PlayerSession
    ): Promise<void> {
        // TODO: figure out what i should do here...
    }
}
