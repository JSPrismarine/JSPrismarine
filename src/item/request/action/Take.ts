import { ItemRequests } from "../ItemRequest";
import SlotInfoRequest from "../SlotInfoRequest";
import ItemActionRequest from "./ActionRequest";

interface TakeRequestType {
    count: number;
    from: SlotInfoRequest;
    to: SlotInfoRequest;
}

export default class TakeRequest implements ItemActionRequest {
    private count: number;
    private from: SlotInfoRequest;
    private to: SlotInfoRequest;

    public constructor({ count, from, to }: TakeRequestType)  {
        this.count = count;
        this.from = from;
        this.to = to;
    }

    public getCount(): number {
        return this.count;
    }

    public getFrom(): SlotInfoRequest {
        return this.from;
    }

    public getTo(): SlotInfoRequest {
        return this.to;
    }

    public getTypeId(): number {
        return ItemRequests.TAKE;
    }
}