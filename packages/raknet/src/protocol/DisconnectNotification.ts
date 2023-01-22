import { MessageIdentifiers } from './MessageIdentifiers.js';
import OfflinePacket from './OfflinePacket.js';

export default class DisconnectNotification extends OfflinePacket {
    public constructor() {
        super(MessageIdentifiers.DISCONNECTION_NOTIFICATION);
    }
}
