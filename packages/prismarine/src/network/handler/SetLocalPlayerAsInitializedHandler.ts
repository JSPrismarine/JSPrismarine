/* import Identifiers from '../Identifiers';
import { type PlayerSession } from '../../';
import type Server from '../../Server';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';
import type PacketHandler from './PacketHandler';
import { PlayerSpawnEvent } from '../../events/Events';

export default class SetLocalPlayerAsInitializedHandler implements PacketHandler<SetLocalPlayerAsInitializedPacket> {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public async handle(
        _packet: SetLocalPlayerAsInitializedPacket,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        // TODO: figure out what i should do here...
        const spawnEvent = new PlayerSpawnEvent(session.getPlayer());
        server.getEventManager().post(['playerSpawn', spawnEvent]);
        if (spawnEvent.isCancelled()) return;
    }
} */
