import { ItemRequests } from "../ItemRequest";
import ItemActionRequest from "./ActionRequest";

interface CreativeCreateRequestType {
    itemId: number;
}

export default class CreativeCreateRequest implements ItemActionRequest {
    private itemId: number;

    public constructor({ itemId }: CreativeCreateRequestType) {
        this.itemId = itemId;
    }

    public getItemId(): number {
        return this.itemId;
    }

    public getTypeId(): number {
        return ItemRequests.CREATIVE_CREATE;
    }
}