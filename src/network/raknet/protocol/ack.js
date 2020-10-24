const AcknowledgePacket = require('./acknowledge_packet');
const Identifiers = require('./identifiers');

'use strict';

class ACK extends AcknowledgePacket {

    constructor() {
        super(Identifiers.AcknowledgePacket);
    }

}
module.exports = ACK;