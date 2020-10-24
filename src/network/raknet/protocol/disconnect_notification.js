const OfflinePacket = require('./offline_packet');
const Identifiers = require('./identifiers');

'use strict';

class DisconnectNotification extends OfflinePacket {

    constructor() {
        super(Identifiers.DisconnectNotification);
    }

    read() {
        super.read();
    }
    
}
module.exports = DisconnectNotification;