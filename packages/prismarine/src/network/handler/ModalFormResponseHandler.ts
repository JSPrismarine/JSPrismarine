import { DisconnectReason } from '@jsprismarine/minecraft';
import type ModalFormResponsePacket from '@jsprismarine/protocol/bedrock/packet/ModalFormResponsePacket';
import { ModalFormCancelReason } from '@jsprismarine/protocol/bedrock/packet/ModalFormResponsePacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/** The reason a client that answers a form with text that is not JSON is disconnected with. */
export const MALFORMED_FORM_RESPONSE = 'Answered a form with text that is not JSON';

/**
 * A client's answer to a form.
 *
 * The answer is an input ([ADR 0009](../../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)):
 * the input step hands it to the behavior pack scripts, whose next script flush settles the
 * form's `show()` promise and drops an answer for a form they did not send. Bedrock Dedicated
 * Server disconnects a client that answers with text that is not JSON, as the `forms` and
 * `form-responses` scenarios of the parity suite record, and so does this handler. It never
 * throws.
 */
export default class ModalFormResponseHandler implements InputLaneHandler<ModalFormResponsePacket> {
    public static PacketName = 'ModalFormResponsePacket';
    public readonly phases = ['play'] as const;
    // Settles a script's form, which changes what the scripts do next.
    public readonly lane = 'input';

    /** Hands the answer to the scripts, or disconnects a client whose answer is not JSON. */
    public handle(packet: ModalFormResponsePacket, { session, log, services, step }: InputContext): undefined {
        const name = session.identity.name;
        if (packet.jsonResponse !== null && !parses(packet.jsonResponse)) {
            log.debug(`${name} answered form ${packet.formId} with text that is not JSON, disconnected`);
            step.output(session.kick(MALFORMED_FORM_RESPONSE, DisconnectReason.BAD_PACKET));
            return;
        }

        const taken = services.scriptForms.answerForm({
            player: String(session.getRuntimeId()),
            formId: packet.formId,
            response: packet.jsonResponse,
            cancelReason: packet.formCancelReason
        });
        if (taken) return;

        const outcome =
            packet.jsonResponse !== null
                ? `submitted ${packet.jsonResponse}`
                : packet.formCancelReason !== null
                  ? `dismissed (${ModalFormCancelReason[packet.formCancelReason] ?? packet.formCancelReason})`
                  : 'answered with neither a response nor a reason';
        log.debug(`${name} ${outcome} form ${packet.formId}, which no script sent`);
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
