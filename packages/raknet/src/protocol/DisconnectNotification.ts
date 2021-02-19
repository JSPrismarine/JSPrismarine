import Identifiers from './Identifiers';
import OfflinePacket from './OfflinePacket';

export default class DisconnectNotification extends OfflinePacket {
    public constructor() {
        super(Identifiers.DisconnectNotification);
    }
}
