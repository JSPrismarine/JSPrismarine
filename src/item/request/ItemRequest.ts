import ItemActionRequest from "./action/ActionRequest";

export enum ItemRequests {
    TAKE,
    PLACE,
    SWAP,
    DROP,
    DESTROY,
    CONSUME,
    UNKNOWN1,
    UNKNOWN2,
    UNKNOWN3, // Related to effects
    UNKNOWN4,
    UNKNOWN5,
    CREATIVE_CREATE,
    CRAFTING_NON_IMPLEMENTED_DEPRECATED,
    CRAFTING_RESULTS_DEPRECATED
}

export default class ItemRequest {
    private id: number;
    private requests: Array<ItemActionRequest>;

    /**
     * Constructs a new ItemRequest.
     *
     * @param id
     * @param requests
     */
    public constructor(id: number, requests: Array<ItemActionRequest>) {
        this.id = id;
        this.requests = requests ?? new Array(0);
    }

    public getId(): number {
        return this.id;
    }

    public getRequests() {
        return this.requests;
    }
}