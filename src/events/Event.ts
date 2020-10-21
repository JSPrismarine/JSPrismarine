export default class Event {
    public cancelled = false;
    constructor() {}

    public preventDefault() {
        this.cancelled = true;
    }
};
