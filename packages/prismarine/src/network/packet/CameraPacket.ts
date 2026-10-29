import DataPacket from './DataPacket';

/**
 * Points an Education Edition tripod camera at a player.
 *
 * **Bound To:** Client
 *
 * Only the tripod camera item and the `takepicture` command send it, both of which are
 * Education Edition features this server does not implement.
 *
 * Protocol 2193 layout (docs id 73), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Camera ID | varint64 | Unique id of the camera actor |
 * | Target Player ID | varint64 | Unique id of the player to photograph |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-packet/
 */
export default class CameraPacket extends DataPacket {
    /** Camera ID, the unique id of the camera actor taking the picture. */
    public cameraId = 0n;

    /** Target Player ID, the unique id of the player the picture is of. */
    public targetPlayerId = 0n;

    /** Reads both unique ids. */
    public decodePayload(): void {
        this.cameraId = this.readVarLong();
        this.targetPlayerId = this.readVarLong();
    }

    /** Writes both unique ids. */
    public encodePayload(): void {
        this.writeVarLong(this.cameraId);
        this.writeVarLong(this.targetPlayerId);
    }
}
