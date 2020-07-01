const DataPacket = require('./data_packet')

'use strict'

const Status = {
    LoginSuccess: 0,
    LoginFailedClient: 1,
    LoginFailedServer: 2,
    PlayerSpawn: 3,
    LoginFailedInvalidTenant: 4,
    LoginFailedVanillaEdu: 5,
    LoginFailedEduVanilla: 6
}
class PlayStatusPacket extends DataPacket {
    static NetID = 0x02  // TODO

    status

    encodePayload() {
        this.writeInt(this.status)
    }
}
module.exports = { PlayStatusPacket, Status }