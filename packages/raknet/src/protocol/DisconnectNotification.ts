import { MessageIdentifiers } from './MessageIdentifiers';
import OfflinePacket from './OfflinePacket';

export default class DisconnectNotification extends OfflinePacket {
    public constructor() {
        super(MessageIdentifiers.DISCONNECTION_NOTIFICATION);
    }
}
