const DataPacket = require('./packet');
const Identifiers = require('../identifiers');

'use strict';

class NetworkChunkPublisherUpdatePacket extends DataPacket {
    static NetID = Identifiers.NetworkChunkPublisherUpdatePacket

    x
    y
    z
    radius

    encodePayload() {
        this.writeVarInt(this.x);
        this.writeVarInt(this.y);
        this.writeVarInt(this.z);
        this.writeUnsignedVarInt(this.radius);
    }
}
module.exports = NetworkChunkPublisherUpdatePacket;