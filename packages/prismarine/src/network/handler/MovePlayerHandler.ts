import type MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A `MovePlayerPacket` from the client, which this server reads and drops.
 *
 * The packet moved a player only in the movement mode Mojang deprecated in protocol 800
 * (1.21.80) and whose `StartGame` setting it removed in protocol 818 (1.21.90). The docs now
 * say "For client authoritative and server authoritative movement modes, it is only intended
 * as a client-bound packet", and the field a vehicle rider filled in names
 * `PlayerAuthInputPacket::mClientPredictedVehicle` as its server authoritative equivalent. A
 * client of a supported protocol moves, turns and rides with `PlayerAuthInputPacket` alone, so
 * nothing here is kept, `OnlyHeadRot` included; see `docs/research/moveplayer-teleport-ack.md`.
 *
 * Still registered so the packet is decoded and dropped on purpose, at debug level, instead
 * of logged as unhandled. It writes nothing, so it is in the connection lane and costs no
 * share of the input step. The server still sends this packet to clients.
 */
export default class MovePlayerHandler implements ConnectionLaneHandler<MovePlayerPacket> {
    public static PacketName = 'MovePlayerPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Drops the packet and logs it: a client moves with `PlayerAuthInput`, which carries its position. */
    public async handle(_packet: MovePlayerPacket, { session, log }: SessionContext): Promise<void> {
        log.debug(
            `Dropped a MovePlayer from ${session.identity.name}: clients move with PlayerAuthInput`,
            'MovePlayerHandler/handle'
        );
    }
}
