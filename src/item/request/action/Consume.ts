import { ItemRequests } from "../ItemRequest";
import SlotInfoRequest from "../SlotInfoRequest";
import ItemActionRequest from "./ActionRequest";

interface ConsumeRequestType {
    count: number;
    from: SlotInfoRequest;
}

export default class ConsumeRequest implements ItemActionRequest {
    private count: number;
    private from: SlotInfoRequest;

    public constructor({ count, from }: ConsumeRequestType) {
        this.count = count;
        this.from = from;
    }

    public getCount(): number {
        return this.count;
    }

    public getFrom(): SlotInfoRequest {
        return this.from;
    }

    public getTypeId(): number {
        return ItemRequests.CONSUME;
    }
}   