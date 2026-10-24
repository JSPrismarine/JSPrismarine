import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client saying it has finished spawning and has a player to show.
 *
 * The packet carries a runtime id, which is ignored: the only player this can be about is
 * the one on the connection it arrived on. The client sends it once, and a second one is
 * dropped - acting on it again re-announced the player to everyone who can see it and
 * resent its whole state, which is a spawn broadcast per packet for anything that cares to
 * send them.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-local-player-as-initialized-packet/
 */
export default class SetLocalPlayerAsInitializedHandler implements PacketHandler<SetLocalPlayerAsInitializedPacket> {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    /** Puts the player into its world and sends it the state the client throws away while spawning. */
    public async handle(
        _packet: SetLocalPlayerAsInitializedPacket,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        const player = session.getPlayer();

        // The player's own world, which is where `completeSpawn` and everything after it
        // look for them. It is the default world today, because that is the only one a join
        // puts anybody in, but reading it off the player is what keeps the two in step.
        const world = player.getWorld();

        if (world.getEntity(player.getRuntimeId()) !== null) {
            server
                .getLogger()
                .debug(
                    `${player.getName()} said it was initialized twice; the second was dropped`,
                    'SetLocalPlayerAsInitializedHandler/handle'
                );
            return;
        }

        // Into the world only now: this is the client saying it has a player to show, so
        // this is when everyone else gets an `AddPlayer` for it.
        await world.addEntity(player);

        // The one place `completeSpawn` runs. The join burst in `ResourcePackClientResponseHandler`
        // already sent the gamemode, settings, abilities, attributes, metadata and inventory,
        // but the client rebuilds its local player while spawning and loses them - the hunger
        // bar sat empty without this. It used to run from the burst as well, so everything
        // went out twice.
        await player.completeSpawn();
    }
}
