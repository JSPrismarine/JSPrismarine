import type SettingsCommandPacket from '@jsprismarine/protocol/bedrock/packet/SettingsCommandPacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * A command issued from a settings screen.
 *
 * Known gap: Suppress Output? is read and ignored, because the command manager has no quiet mode
 * and sends its messages straight to the player.
 */
export default class SettingsCommandDecoder implements PacketDecoder<SettingsCommandPacket, 'runCommand'> {
    public static readonly PacketName = 'SettingsCommandPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['runCommand'] as const;

    /** Decodes the command line. */
    public decode(packet: SettingsCommandPacket, _view: DecodeView): readonly Intent<'runCommand'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.SettingsCommandNotDecoded();
        return [{ kind: 'runCommand', command: data.command }];
    }
}
