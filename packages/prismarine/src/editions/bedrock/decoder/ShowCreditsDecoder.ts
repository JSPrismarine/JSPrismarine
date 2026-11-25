import type ShowCreditsPacket from '@jsprismarine/protocol/bedrock/packet/ShowCreditsPacket';
import { CreditsState } from '@jsprismarine/protocol/bedrock/packet/ShowCreditsPacket';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * The client reporting that the end credits have finished. A client-sent `Start` is logged at
 * debug and dropped, since only the server starts the credits.
 */
export default class ShowCreditsDecoder implements PacketDecoder<ShowCreditsPacket, 'finishCredits'> {
    public static readonly PacketName = 'ShowCreditsPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['finishCredits'] as const;

    /** Decodes `Finished`, and drops anything else. */
    public decode(packet: ShowCreditsPacket, view: DecodeView): readonly Intent<'finishCredits'>[] {
        if (packet.creditsState === CreditsState.Finished) return [{ kind: 'finishCredits' }];

        view.log.debug(`${view.name} reported the end credits started, which only the server may say`);
        return [];
    }
}
