import ModalFormRequestPacket from '../packet/ModalFormRequestPacket';
import PacketHandler from './PacketHandler';
import Player from '../../player/Player';
import Server from '../../Server';

export default class ModalFormResponseHandler implements PacketHandler<ModalFormRequestPacket> {
    public async handle(packet: ModalFormRequestPacket, _server: Server, player: Player): Promise<void> {
        const formId = packet.formId;
        const form = player.getFormManager().getForm(formId);
        if (form === null) return;
        form.handleResponse(player, JSON.parse(packet.formData));
        player.getFormManager().deleteForm(formId);
    }
}
