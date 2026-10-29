import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ModalFormResponsePacket from '../packet/ModalFormResponsePacket';
import { ModalFormCancelReason } from '../packet/ModalFormResponsePacket';
import type PacketHandler from './PacketHandler';

/**
 * A form response.
 *
 * The server sends no `ModalFormRequestPacket` or `ServerSettingsResponsePacket`, so no form
 * id can match a pending form and every response is dropped after a debug line. A response
 * whose JSON does not parse is logged at warn instead, since a client only produces that by
 * hand. When forms arrive, this is where the id should look up the waiting request and hand
 * it the parsed JSON or the cancel reason.
 */
export default class ModalFormResponseHandler implements PacketHandler<ModalFormResponsePacket> {
    public static PacketName = 'ModalFormResponsePacket';

    /** Logs the form id with either the JSON or the cancel reason, and never throws. */
    public handle(packet: ModalFormResponsePacket, server: Server, session: PlayerSession): void {
        const logger = server.getLogger();
        const name = session.getPlayer().getName();

        if (packet.jsonResponse !== null && !parses(packet.jsonResponse)) {
            logger.warn(
                `${name} answered form ${packet.formId} with text that is not JSON, dropped`,
                'ModalFormResponseHandler/handle'
            );
            return;
        }

        const outcome =
            packet.jsonResponse !== null
                ? `submitted ${packet.jsonResponse}`
                : packet.formCancelReason !== null
                  ? `dismissed (${ModalFormCancelReason[packet.formCancelReason] ?? packet.formCancelReason})`
                  : 'answered with neither a response nor a reason';

        logger.debug(
            `${name} ${outcome} form ${packet.formId}, which the server never sent`,
            'ModalFormResponseHandler/handle'
        );
    }
}

/** Whether `text` is a JSON document. The parsed value is not kept; a form has no caller yet. */
const parses = (text: string): boolean => {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
};
