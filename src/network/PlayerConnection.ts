import NetworkQueueHandler from "./raknet/handler/NetworkQueueHandler";

export enum PlayerConnectionStatus {
    Connecting = 0,
    Connected = 1,
};

export default class PlayerConnection extends NetworkQueueHandler {
    public status = PlayerConnectionStatus.Connected;
}
