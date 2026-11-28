import { DisconnectReason } from '@jsprismarine/minecraft';
import type ModalFormResponsePacket from '@jsprismarine/protocol/bedrock/packet/ModalFormResponsePacket';
import type { InputContext } from '../../../player/context/HandlerContext';
import type { InputLaneHandler } from '../../../player/context/SessionHandler';

/** The reason a client that answers a form with text that is not JSON is disconnected with. */
export const MALFORMED_FORM_RESPONSE = 'Answered a form with text that is not JSON';

/**
 * A client's answer to a form, which the `answerForm` intent hands to the scripts.
 *
 * Bedrock Dedicated Server disconnects a client that answers with text that is not JSON, as the
 * `forms` and `form-responses` scenarios of the parity suite record, and so does this handler.
 * That is Bedrock's form protocol, so it stays here rather than in the intent. It never throws.
 */
export default class ModalFormResponseHandler implements InputLaneHandler<ModalFormResponsePacket> {
    public static PacketName = 'ModalFormResponsePacket';
    public readonly phases = ['play'] as const;
    // Settles a script's form, which changes what the scripts do next.
    public readonly lane = 'input';

    /** Hands the answer on, or disconnects a client whose answer is not JSON. */
    public handle(packet: ModalFormResponsePacket, context: InputContext): undefined {
        const { session, log, services, step } = context;
        const name = session.identity.name;
        if (packet.jsonResponse !== null && !parses(packet.jsonResponse)) {
            log.debug(`${name} answered form ${packet.formId} with text that is not JSON, disconnected`);
            step.output(session.kick(MALFORMED_FORM_RESPONSE, DisconnectReason.BAD_PACKET));
            return;
        }

        const answered = services.intents.handle(
            {
                kind: 'answerForm',
                formId: packet.formId,
                response: packet.jsonResponse,
                cancelReason: packet.formCancelReason
            },
            context
        );
        if (answered instanceof Promise) step.output(answered);
    }
}

/** Whether `text` is a JSON document. */
const parses = (text: string): boolean => {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
};
