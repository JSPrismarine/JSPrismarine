import type { SetLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

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
export default class SetLocalPlayerAsInitializedHandler implements InputLaneHandler<SetLocalPlayerAsInitializedPacket> {
    public static PacketName = 'SetLocalPlayerAsInitializedPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Puts the player into its world and sends it the state the client throws away while spawning. */
    public handle(_packet: SetLocalPlayerAsInitializedPacket, { session, log, step }: InputContext): undefined {
        // The player's own world, which is where `completeSpawn` and everything after it
        // look for them. It is the default world today, because that is the only one a join
        // puts anybody in, but reading it off the session is what keeps the two in step.
        const world = session.getWorld();

        if (world.getActor(session.runtimeId) !== null) {
            log.debug(
                `${session.identity.name} said it was initialized twice; the second was dropped`,
                'SetLocalPlayerAsInitializedHandler/handle'
            );
            return;
        }

        // The join's result enters the world here, as this input: the player the login built
        // in front of the join, and whose record it loaded. One deferred piece, so a failure in
        // `completeSpawn` still undoes the entry. `World.addPlayer` writes before it returns
        // and is asynchronous only in its signature, which the D2 close makes synchronous.
        // `completeSpawn` waits on its sends before it writes the game mode it sent, which
        // slice 7 takes out of the simulation.
        step.defer(async () => {
            // Into the world only now: this is the client saying it has a player to show, so
            // this is when everyone else gets an `AddPlayer` for it.
            await world.addPlayer(session);

            // The one place `completeSpawn` runs. The join burst in
            // `ResourcePackClientResponseHandler` already sent the gamemode, settings,
            // abilities, attributes, metadata and inventory, but the client rebuilds its local
            // player while spawning and loses them - the hunger bar sat empty without this. It
            // used to run from the burst as well, so everything went out twice.
            await session.completeSpawn();
        });
    }
}
