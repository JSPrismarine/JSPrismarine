class ItemStackRequestSlotInfo {
    public containerId!: number;
    public slot!: number;
    public stackNetworkId!: number;

    public constructor({
        containerId,
        slot,
        stackNetworkId
    }: {
        containerId: number;
        slot: number;
        stackNetworkId: number;
    }) {
        this.containerId = containerId;
        this.slot = slot;
        this.stackNetworkId = stackNetworkId;
    }
}

export default ItemStackRequestSlotInfo;
