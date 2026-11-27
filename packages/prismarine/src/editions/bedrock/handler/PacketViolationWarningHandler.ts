import { latestCodec } from '../../../network/codec/CodecRegistry';
import {
    PacketViolationSeverity,
    PacketViolationType
} from '@jsprismarine/protocol/bedrock/packet/PacketViolationWarningPacket';
import type PacketViolationWarningPacket from '@jsprismarine/protocol/bedrock/packet/PacketViolationWarningPacket';
import type { SessionContext } from '../../../player/context/HandlerContext';
import type { ConnectionLaneHandler } from '../../../player/context/SessionHandler';

/** The packet name assigned to an id by the newest codec, or `null` when it is unknown. */
const packetNameOf = (id: number): string | null =>
    Object.entries(latestCodec.ids).find(([, packetId]) => packetId === id)?.[0] ?? null;

/**
 * The client reporting that a packet the server sent did not parse.
 *
 * Logged at warning level, and during a join with a link to report it: the packet is the client's
 * bug report about the server's own output, so the fix is in whichever encoder it names, not in
 * the session. The line names the rejected packet from its id, because a client that hangs on the
 * loading screen usually sent one of these about the last packet it could not read.
 */
export default class PacketViolationWarningHandler implements ConnectionLaneHandler<PacketViolationWarningPacket> {
    public static PacketName = 'PacketViolationWarningPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;
    public readonly lane = 'connection';

    /**
     * Logs who complained, which packet, how badly, and the client's own words, and reports a
     * failed join when the player has not spawned yet.
     */
    public handle(packet: PacketViolationWarningPacket, { session, log }: SessionContext): void {
        const name = packetNameOf(packet.packetId) ?? 'an unregistered packet';
        const id = `0x${packet.packetId.toString(16)}`;
        const type = PacketViolationType[packet.type] ?? `type ${packet.type}`;
        const severity = PacketViolationSeverity[packet.severity] ?? `severity ${packet.severity}`;

        log.warn(`${session.identity.name} rejected ${name} (${id}) as ${type}, ${severity}: "${packet.message}"`);
        session
            .getConnection()
            .reportJoinFailure(
                log,
                `The client rejected the server's ${name} (${id}) as ${type}, ${severity}: "${packet.message}".`
            );
    }
}
