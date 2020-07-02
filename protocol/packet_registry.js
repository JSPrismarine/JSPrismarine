const DataPacket = require('./mcbe/data_packet')
const LoginPacket = require('./mcbe/login_packet')
const ClientCacheStatusPacket = require('./mcbe/client_cache_status_packet')
const { ResourcePackClientResponsePacket } = require('./mcbe/resource_pack_client_response_packet')
const ResourcePackStackPacket = require('./mcbe/resource_pack_stack_packet')
const { PacketViolationWarning } = require('./mcbe/packet_violation_warning')
const RequestChunkRadiusPacket = require('./mcbe/request_chunk_radius_packet')
const TickSyncPacket = require('./mcbe/tick_sync_packet')
const SetLocalPlayerAsInitializedPacket = require('./mcbe/set_local_player_as_initialized_packet')
const { MovePlayerPacket } = require('./mcbe/move_player_packet')
const LevelSoundEventPacket = require('./mcbe/level_sound_event_packet')

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
        this.registerPacket(RequestChunkRadiusPacket)
        this.registerPacket(TickSyncPacket)
        this.registerPacket(SetLocalPlayerAsInitializedPacket)
        this.registerPacket(MovePlayerPacket)
        this.registerPacket(LevelSoundEventPacket)
    }
    
}
module.exports = PacketRegistry