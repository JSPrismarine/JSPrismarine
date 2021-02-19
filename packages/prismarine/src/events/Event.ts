export default class Event {
    public cancelled = false;

    public preventDefault(): void {
        this.cancelled = true;
    }
}
