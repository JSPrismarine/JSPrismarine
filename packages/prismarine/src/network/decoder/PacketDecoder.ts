/**
 * A Bedrock packet decoder: a pure function from one packet to the intents it means
 * ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * A decoder reads the packet and a {@link DecodeView} of the sender's session and returns
 * intents. It writes nothing, sends nothing and never sees the world: a check that needs only
 * the view, such as "the packet names the sender", belongs here, and a check that needs the
 * world belongs in the intent handler. A decoder that returns no intents drops the packet, and
 * says why through the view's log.
 *
 * The dispatcher wraps a decoder into a packet handler whose lane is the strictest lane among the
 * intents the decoder declares, so the decoder has to list every kind it can return.
 */
import type { SessionPhase } from '../SessionPhase';
import type { Intent, IntentKind } from '../../input/Intent';
import type { DecodeView } from './DecodeView';

/** A decoder of one packet type. */
export interface PacketDecoder<P, K extends IntentKind = IntentKind> {
    /** The session phases in which the packet is accepted. The dispatcher drops it in any other. */
    readonly phases: readonly SessionPhase[];
    /** Every intent kind {@link decode} may return. The wrapped handler's lane is their strictest. */
    readonly intents: readonly K[];

    /**
     * Turns one packet into the intents it means.
     *
     * @param packet - The decoded packet.
     * @param view - The sender's session, read-only, and where to log a drop.
     * @returns The intents, in the order they are to be handled; none to drop the packet.
     */
    decode(packet: P, view: DecodeView): readonly Intent<K>[];
}

/** A decoder class the server registers for the packet it names. */
export interface PacketDecoderClass {
    /** The class name of the packet the decoder reads. */
    readonly PacketName: string;
    new (): PacketDecoder<any>;
}
