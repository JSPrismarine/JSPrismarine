const Entity = require("./entity")
const EncapsulatedPacket = require('jsraknet/protocol/encapsulated_packet')
const { PlayStatusPacket, Status } = require('./protocol/mcbe/play_status_packet')
const ResourcePacksInfoPacket = require('./protocol/mcbe/resource_packs_info_packet')
const BatchPacket = require("./protocol/mcbe/batch_packet")
const { ResourcePackStatus } = require('./protocol/mcbe/resource_pack_client_response_packet')
const ResourcePackStackPacket = require('./protocol/mcbe/resource_pack_stack_packet')
const StartGamePacket = require("./protocol/mcbe/start_game_packet")

'use strict'

class Player extends Entity {

    #connection

    #address
    #name
    #locale 
    #runtimeId
    // TODO, UUID class and converter  
    #uuid
    #xuid
    #skin

    // Device
    #deviceOS
    #deviceModel
    #deviceId

    constructor(connection, address) {
        super()
        this.#connection = connection
        this.#address = address
    }

    handleDataPacket(packet) {
        switch (packet.id) {
            case 0x01:  // Login 
                this.#name = packet.displayName
                this.#locale = packet.languageCode
                this.#runtimeId = packet.randomClientId
                this.#uuid = packet.identity
                this.#deviceId = packet.deviceId
                this.#deviceOS = packet.deviceOS
                this.#deviceModel = packet.deviceModel
                this.#skin = packet.skin

                this.sendPlayStatus(Status.LoginSuccess)

                let pk = new ResourcePacksInfoPacket()
                this.sendDataPacket(pk)
                break
            case 0x08:  // Resource pack client response    
                if (packet.status === ResourcePackStatus.HaveAllPacks) {
                    let pk = new ResourcePackStackPacket()
                    this.sendDataPacket(pk)
                } else if (packet.status === ResourcePackStatus.Completed) {
                    console.log('Completed!')
                    let pk = new StartGamePacket()
                    this.sendDataPacket(pk)
                }
               break
            case 0x9c:
                console.log(packet)
                break   
        }
    }

    sendPlayStatus(status) {
        let pk = new PlayStatusPacket()
        pk.status = status
        this.sendDataPacket(pk)
    }

    // To refactor
    sendDataPacket(packet, _needACK = false, _immediate = false) {
        let batch = new BatchPacket()
        batch.addPacket(packet)
        batch.encode()

        // Add this in raknet
        let sendPacket = new EncapsulatedPacket()
        sendPacket.reliability = 0
        sendPacket.buffer = batch.buffer

        this.#connection.addEncapsulatedToQueue(sendPacket)
    }

}
module.exports = Player