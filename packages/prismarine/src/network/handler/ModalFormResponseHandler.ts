import Identifiers from '../Identifiers';
import ModalFormRequestPacket from '../packet/ModalFormRequestPacket';
import PacketHandler from './PacketHandler';
import { PlayerSession } from '@';
import Server from '../../Server';

export default class ModalFormResponseHandler implements PacketHandler<ModalFormRequestPacket> {
    public static NetID = Identifiers.ModalFormRequestPacket;

    public async handle(packet: ModalFormRequestPacket, _server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const formId = packet.formId;
        const form = player.getFormManager().getForm(formId);
        if (form === null) return;
        form.handleResponse(player, JSON.parse(packet.formData));
        player.getFormManager().deleteForm(formId);
    }
}
