const AcknowledgePacket = require('./acknowledge_packet');
const Identifiers = require('./identifiers');

'use strict';

class NACK extends AcknowledgePacket {

    constructor() {
        super(Identifiers.NacknowledgePacket);
    }

}
module.exports = NACK;