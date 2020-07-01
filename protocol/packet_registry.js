const DataPacket = require('./mcbe/data_packet')
const LoginPacket = require('./mcbe/login_packet')
const ClientCacheStatusPacket = require('./mcbe/client_cache_status_packet')
const { ResourcePackClientResponsePacket } = require('./mcbe/resource_pack_client_response_packet')
const ResourcePackStackPacket = require('./mcbe/resource_pack_stack_packet')
const { PacketViolationWarning } = require('./mcbe/packet_violation_warning')

'use strict'

class PacketRegistry extends Map {

    constructor() {
        super()
        this.registerPackets()
    }

    /**
     * @param {DataPacket} packet 
     */
    registerPacket(packet) {
        this.set(packet.NetID, packet)
    }

    registerPackets() {
        this.registerPacket(LoginPacket)
        this.registerPacket(ClientCacheStatusPacket)
        this.registerPacket(ResourcePackClientResponsePacket)
        this.registerPacket(ResourcePackStackPacket)
        this.registerPacket(PacketViolationWarning)
    }
    
}
module.exports = PacketRegistry