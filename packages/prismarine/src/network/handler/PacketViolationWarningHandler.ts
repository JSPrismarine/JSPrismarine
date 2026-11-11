import { latestCodec } from '../codec/CodecRegistry';
import {
    PacketViolationSeverity,
    PacketViolationType
} from '@jsprismarine/protocol/packet/PacketViolationWarningPacket';
import type PacketViolationWarningPacket from '@jsprismarine/protocol/packet/PacketViolationWarningPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/** The packet name assigned to an id by the newest codec, or `null` when it is unknown. */
const packetNameOf = (id: number): string | null =>
    Object.entries(latestCodec.ids).find(([, packetId]) => packetId === id)?.[0] ?? null;

/**
 * The client reporting that a packet the server sent did not parse.
 *
 * Logged at warning level and nothing more: the packet is the client's bug report about the
 * server's own output, so the fix is in whichever encoder it names, not in the session. The
 * line names the rejected packet from its id, because a client that hangs on the loading
 * screen usually sent one of these about the last packet it could not read.
 */
export default class PacketViolationWarningHandler implements ConnectionLaneHandler<PacketViolationWarningPacket> {
    public static PacketName = 'PacketViolationWarningPacket';
    public readonly takes = 'context';
    public readonly phases = ['resourcePacks', 'play'] as const;
    public readonly lane = 'connection';

    /** Logs who complained, which packet, how badly, and the client's own words. */
    public handle(packet: PacketViolationWarningPacket, { session, log }: SessionContext): void {
        const name = packetNameOf(packet.packetId) ?? 'an unregistered packet';
        const id = `0x${packet.packetId.toString(16)}`;
        const type = PacketViolationType[packet.type] ?? `type ${packet.type}`;
        const severity = PacketViolationSeverity[packet.severity] ?? `severity ${packet.severity}`;

        log.warn(
            `${session.identity.name} rejected ${name} (${id}) as ${type}, ${severity}: "${packet.message}"`,
            'PacketViolationWarningHandler/handle'
        );
    }
}
