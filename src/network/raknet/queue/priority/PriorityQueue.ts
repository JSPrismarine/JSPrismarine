import { Priorities } from "./Priorities";

// PROTOTYPE ONLY
class PriorityItem {
    private readonly item: any;
    private readonly priority: number;

    constructor(item: any, priority: number) {
        this.item = item;
        this.priority = priority;
    }

    public getItem(): any {
        return this.item;
    }

    public getPriority(): number {
        return this.priority;
    }
}

export default class PriorityQueue {
    private elements: Array<any> = new Array();

    public add(element: any, priority: number) {
        this.elements.push(element);

        /* 
        PROTOTYPE 1:
        switch (priority) {
            case Priorities.HIGH:
                this.elements.unshift(element);
                break;
            case Priorities.MEDIUM:
                add in the middle
                this.elements.
            case Priorities.LOW:
                add in the end with push()
        } 

        PROTOTYPE 2:
        this.elemets.push(new Priority)

        and then when we retrive all the items, we sort it by priority
        this.elements.sort((a, b) => a.getPriority() > b.getPriority())
        */
    }
}