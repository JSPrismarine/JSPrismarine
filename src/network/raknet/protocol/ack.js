const AcknowledgePacket = require('./acknowledge_packet');
const Identifiers = require('./Identifiers').default;

('use strict');

class ACK extends AcknowledgePacket {
    constructor() {
        super(Identifiers.AcknowledgePacket);
    }
}
module.exports = ACK;
