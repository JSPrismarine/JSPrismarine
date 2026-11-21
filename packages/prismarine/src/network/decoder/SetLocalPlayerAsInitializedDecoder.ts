import type { SetLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * The client saying it has finished spawning and has a player to show.
 *
 * The packet carries a runtime id, which is ignored: the only player this can be about is the one
 * on the connection it arrived on.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-local-player-as-initialized-packet/
 */
export default class SetLocalPlayerAsInitializedDecoder implements PacketDecoder<
    SetLocalPlayerAsInitializedPacket,
    'playerInitialized'
> {
    public static readonly PacketName = 'SetLocalPlayerAsInitializedPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['playerInitialized'] as const;

    /** Decodes the notice. */
    public decode(
        _packet: SetLocalPlayerAsInitializedPacket,
        _view: DecodeView
    ): readonly Intent<'playerInitialized'>[] {
        return [{ kind: 'playerInitialized' }];
    }
}
