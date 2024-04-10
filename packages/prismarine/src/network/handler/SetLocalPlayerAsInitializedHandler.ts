import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';

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
