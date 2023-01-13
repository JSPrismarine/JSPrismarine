import MessageHeaders from './MessageHeaders.js';
import OfflinePacket from './UnconnectedPacket.js';

export default class DisconnectNotification extends OfflinePacket {
    public constructor() {
        super(MessageHeaders.DISCONNECT_NOTIFICATION);
    }
}
