/**
 * The docs' `PositionMode`, carried as the Position Mode byte of a `MovePlayerPacket`.
 */
enum PositionMode {
    Normal = 0,
    Respawn = 1,
    Teleport = 2,
    OnlyHeadRot = 3
}

export default PositionMode;
