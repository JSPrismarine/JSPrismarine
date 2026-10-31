import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ClientCameraAimAssistPacket from '@jsprismarine/protocol/packet/ClientCameraAimAssistPacket';
import type PacketHandler from './PacketHandler';

/**
 * Accepts the client's aim assist activation report.
 *
 * The server does not implement camera presets or aim assist, so it accepts these reports
 * without applying them.
 */
export default class ClientCameraAimAssistHandler implements PacketHandler<ClientCameraAimAssistPacket> {
    public static PacketName = 'ClientCameraAimAssistPacket';
    public readonly phases = ['play'] as const;

    /** Accepts the report while camera presets and aim assist remain unsupported. */
    public handle(_packet: ClientCameraAimAssistPacket, _server: Server, _session: PlayerSession): void {
        // No server state to update until camera presets and aim assist are implemented.
    }
}
