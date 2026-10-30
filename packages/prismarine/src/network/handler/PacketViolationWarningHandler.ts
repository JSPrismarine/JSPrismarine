import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import { latestCodec } from '../codec/CodecRegistry';
import {
    PacketViolationSeverity,
    PacketViolationType
} from '@jsprismarine/protocol/packet/PacketViolationWarningPacket';
import type PacketViolationWarningPacket from '@jsprismarine/protocol/packet/PacketViolationWarningPacket';
import type PacketHandler from './PacketHandler';

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
export default class PacketViolationWarningHandler implements PacketHandler<PacketViolationWarningPacket> {
    public static PacketName = 'PacketViolationWarningPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;

    /** Logs who complained, which packet, how badly, and the client's own words. */
    public handle(packet: PacketViolationWarningPacket, server: Server, session: PlayerSession): void {
        const name = packetNameOf(packet.packetId) ?? 'an unregistered packet';
        const id = `0x${packet.packetId.toString(16)}`;
        const type = PacketViolationType[packet.type] ?? `type ${packet.type}`;
        const severity = PacketViolationSeverity[packet.severity] ?? `severity ${packet.severity}`;

        server
            .getLogger()
            .warn(
                `${session.getPlayer().getName()} rejected ${name} (${id}) as ${type}, ${severity}: "${packet.message}"`,
                'PacketViolationWarningHandler/handle'
            );
    }
}
