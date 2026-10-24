import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type ModalFormResponsePacket from '../packet/ModalFormResponsePacket';
import { ModalFormCancelReason } from '../packet/ModalFormResponsePacket';
import type PacketHandler from './PacketHandler';

/**
 * A form response.
 *
 * The server does not send forms yet, so there is no pending form to match the id against.
 * The response is recorded at debug level and dropped. When forms arrive, this is where the
 * id should look up the waiting request and hand it the JSON or the cancel reason.
 */
export default class ModalFormResponseHandler implements PacketHandler<ModalFormResponsePacket> {
    public static NetID = Identifiers.ModalFormResponsePacket;

    /** Logs the form id with either the JSON or the cancel reason. */
    public handle(packet: ModalFormResponsePacket, server: Server, session: PlayerSession): void {
        const outcome =
            packet.jsonResponse !== null
                ? `submitted ${packet.jsonResponse}`
                : packet.formCancelReason !== null
                  ? `dismissed (${ModalFormCancelReason[packet.formCancelReason] ?? packet.formCancelReason})`
                  : 'answered with neither a response nor a reason';

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ${outcome} form ${packet.formId}, which the server never sent`,
                'ModalFormResponseHandler/handle'
            );
    }
}
