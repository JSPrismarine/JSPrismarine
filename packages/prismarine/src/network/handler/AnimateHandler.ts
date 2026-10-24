import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import AnimatePacket, { AnimateAction } from '../packet/AnimatePacket';
import type PacketHandler from './PacketHandler';

/**
 * The animations a client plays on itself and asks to have shown to everyone else.
 *
 * `NoAction` animates nothing, and a byte outside the enum is not a 2193 client's doing, so
 * neither is relayed.
 */
const CLIENT_ACTIONS: ReadonlySet<number> = new Set([
    AnimateAction.Swing,
    AnimateAction.WakeUp,
    AnimateAction.CriticalHit,
    AnimateAction.MagicCriticalHit
]);

/** Relays a client's animation to the players in its world that have it on screen. */
export default class AnimateHandler implements PacketHandler<AnimatePacket> {
    public static NetID = Identifiers.AnimatePacket;

    /**
     * Rebroadcasts the animation under the sender's runtime id, keeping the action, data and
     * swing source the client sent. The sender and anyone not tracking it are skipped.
     *
     * A packet naming another actor, or an action no client sends, is logged at debug level
     * and dropped: a client animates itself, and relaying it as anyone else would let one
     * player make another swing.
     */
    public async handle(packet: AnimatePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        if (packet.runtimeEntityId !== player.getRuntimeId()) {
            server
                .getLogger()
                .debug(
                    `Dropped animation ${packet.action} from ${player.getName()}: it names actor ${packet.runtimeEntityId}, not themselves`,
                    'AnimateHandler/handle'
                );
            return;
        }

        if (!CLIENT_ACTIONS.has(packet.action)) {
            server
                .getLogger()
                .debug(
                    `Dropped animation ${packet.action} from ${player.getName()}: not one a client sends`,
                    'AnimateHandler/handle'
                );
            return;
        }

        const pk = new AnimatePacket();
        pk.runtimeEntityId = player.getRuntimeId();
        pk.action = packet.action;
        pk.data = packet.data;
        pk.swingSource = packet.swingSource;

        // The player's own world, and only the clients that have them on screen. This went
        // through the session manager, so an arm swing reached every player on the server -
        // across worlds, and at any distance.
        await Promise.all(
            player
                .getWorld()
                .getPlayers()
                .filter((otherPlayer) => otherPlayer !== player)
                .filter((otherPlayer) => otherPlayer.getNetworkSession().tracks(player.getRuntimeId()))
                .map(async (otherPlayer) => otherPlayer.getNetworkSession().send(pk))
        );
    }
}
