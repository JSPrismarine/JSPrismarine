/**
 * Where a packet decoder becomes a packet handler the dispatcher can run
 * ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * The wrapped handler runs in the strictest lane among the intents the decoder declares, decodes
 * the packet against the session's view, and hands each intent to its handler in that lane's
 * context. An input-lane wrapper returns nothing to wait for: a read-lane intent handler that
 * returns a promise has it handed to the step's outputs, as a merged handler does.
 */
import { PrismarineInputErrors } from '@jsprismarine/errors/prismarine/input';
import type { IntentKind } from '../../input/Intent';
import { isIntentKind, laneOfIntents } from '../../input/Intent';
import type { IntentHandlerRegistry } from '../../input/IntentHandlerRegistry';
import type { InputContext, SessionContext } from '../handler/HandlerContext';
import type { SessionHandler } from '../handler/SessionHandler';
import { viewOf } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * Wraps a decoder into a handler of its packet.
 *
 * @param packetName - The class name of the packet the decoder reads, for error messages.
 * @param decoder - The decoder.
 * @param intents - Where the decoded intents are handled.
 * @returns A handler in the shared shape, in the lane the decoder's intents need.
 * @throws When the decoder declares a kind the intent table does not have.
 */
export const decodedHandler = <P, K extends IntentKind>(
    packetName: string,
    decoder: PacketDecoder<P, K>,
    intents: IntentHandlerRegistry
): SessionHandler<P> => {
    for (const kind of decoder.intents) {
        if (!isIntentKind(kind)) throw new PrismarineInputErrors.UnknownIntentKind({ kind });
    }
    const declared = new Set<string>(decoder.intents);
    const lane = laneOfIntents(decoder.intents);
    const { phases } = decoder;

    const decode = (packet: P, { session, log }: SessionContext) => {
        const produced = decoder.decode(packet, viewOf(session, log));
        for (const intent of produced) {
            if (!declared.has(intent.kind)) {
                throw new PrismarineInputErrors.UndeclaredIntent({ packetName, kind: intent.kind });
            }
        }
        return produced;
    };

    if (lane === 'input') {
        return {
            lane,
            phases,
            handle: (packet: P, context: InputContext): undefined => {
                for (const intent of decode(packet, context)) {
                    const result = intents.handle(intent, context);
                    if (result instanceof Promise) context.step.output(result);
                }
            }
        };
    }

    const handle = async (packet: P, context: SessionContext): Promise<void> => {
        for (const intent of decode(packet, context)) await intents.handle(intent, context);
    };
    return lane === 'read' ? { lane, phases, handle } : { lane, phases, handle };
};
