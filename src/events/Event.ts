export default class Event {
    public cancelled = false;
    constructor() {}

    public preventDefault(): void {
        this.cancelled = true;
    }
};
