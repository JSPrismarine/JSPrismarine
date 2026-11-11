import type ClientCameraAimAssistPacket from '@jsprismarine/protocol/packet/ClientCameraAimAssistPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * Accepts the client's aim assist activation report.
 *
 * The server does not implement camera presets or aim assist, so it accepts these reports
 * without applying them.
 */
export default class ClientCameraAimAssistHandler implements ConnectionLaneHandler<ClientCameraAimAssistPacket> {
    public static PacketName = 'ClientCameraAimAssistPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Accepts the report while camera presets and aim assist remain unsupported. */
    public handle(_packet: ClientCameraAimAssistPacket, _context: SessionContext): void {
        // No server state to update until camera presets and aim assist are implemented.
    }
}
