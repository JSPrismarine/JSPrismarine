'use strict'

const Identifiers = {
    Protocol: 407,

    MinecraftVersion: '1.16.0',

    LoginPacket: 0x01,
    PlayStatusPacket: 0x02,
    ServerToClientHandshakePacket: 0x03,
    ClientToServerHandshakePacket: 0x04,
    DisconnectPacket: 0x05,
    ResourcePacksInfoPacket: 0x06,
    ResourcePackStackPacket: 0x07,
    ResourcePackClientResponsePacket: 0x08,
    TextPacket: 0x09,
    SetTimePacket: 0x0a,
    StartGamePacket: 0x0b,
    AddPlayerPacket: 0x0c,
    AddActorPacket: 0x0d,
    RemoveActorPacket: 0x0e,
    AddItemActorPacket: 0x0f,
    TakeItemActorPacket: 0x11,
    MoveActorAbsolutePacket: 0x12,
    MovePlayerPacket: 0x13,
    RiderJumpPacket: 0x14,
    UpdateBlockPacket: 0x15,
    AddPaintingPacket: 0x16
}
module.exports = Identifiers