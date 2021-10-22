import MessageHeaders from './MessageHeaders';
import OfflinePacket from './UnconnectedPacket';

export default class DisconnectNotification extends OfflinePacket {
    public constructor() {
        super(MessageHeaders.DISCONNECT_NOTIFICATION);
    }
}
