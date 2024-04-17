import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';
import type PacketHandler from './PacketHandler';

export default class SetLocalPlayerAsInitializedHandler implements PacketHandler<SetLocalPlayerAsInitializedPacket> {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public async handle(
        _packet: SetLocalPlayerAsInitializedPacket,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        const player = session.getPlayer();
        const world = server.getWorldManager().getDefaultWorld();

        // Add player to the world.
        await world.addEntity(player);

        // Send the spawn packets.
        await player.sendSpawn();
    }
}
