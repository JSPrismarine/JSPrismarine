import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type ServerboundDiagnosticsPacket from '../packet/ServerboundDiagnosticsPacket';
import type PacketHandler from './PacketHandler';

/**
 * Client performance telemetry.
 *
 * The server keeps no telemetry store, so the sample is summarized at debug level and dropped.
 * Nothing is sent back; the client keeps sending every 500 ms while its profiler is on.
 */
export default class ServerboundDiagnosticsHandler implements PacketHandler<ServerboundDiagnosticsPacket> {
    public static NetID = Identifiers.ServerboundDiagnosticsPacket;

    /** Logs the frame rate and tick times from the sample. */
    public handle(packet: ServerboundDiagnosticsPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} reports ${packet.avgFps.toFixed(1)} fps, ${packet.avgClientSimTickTimeMs.toFixed(2)} ms client tick, ${packet.avgServerSimTickTimeMs.toFixed(2)} ms server tick, ${packet.memoryCategoryValues.length} memory categories`,
                'ServerboundDiagnosticsHandler/handle'
            );
    }
}
