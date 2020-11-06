const OfflinePacket = require('./offline_packet');
const Identifiers = require('./Identifiers').default;

('use strict');

class DisconnectNotification extends OfflinePacket {
    constructor() {
        super(Identifiers.DisconnectNotification);
    }

    read() {
        super.read();
    }
}
module.exports = DisconnectNotification;
