interface SlotInfoRequestType {
    containerId: number;
    slot: number;
    stackNetworkId: number;
}

export default class SlotInfoRequest {

    private containerId: number;
    private slot: number;
    private stackNetworkId: number;

    public constructor({ containerId, slot, stackNetworkId }: SlotInfoRequestType) {
        this.containerId = containerId;
        this.slot = slot;
        this.stackNetworkId = stackNetworkId;
    }

    public getContainerId(): number {
        return this.containerId;
    }

    public getSlot(): number {
        return this.slot;
    }

    public getStackNetworkId(): number {
        return this.stackNetworkId;
    }
}