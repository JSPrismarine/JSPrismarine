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

        // Into the world only now: this is the client saying it has a player to show, so
        // this is when everyone else gets an `AddPlayer` for it.
        await world.addEntity(player);

        // The one place `completeSpawn` runs. The join burst in `ResourcePackResponseHandler`
        // already sent the gamemode, settings, abilities, attributes, metadata and inventory,
        // but the client rebuilds its local player while spawning and loses them - the hunger
        // bar sat empty without this. It used to run from the burst as well, so everything
        // went out twice.
        await player.completeSpawn();
    }
}
