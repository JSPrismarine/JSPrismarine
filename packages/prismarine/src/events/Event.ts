export default class Event {
    private cancelled = false;

    public isCancelled(): boolean {
        return this.cancelled;
    }

    public preventDefault(): void {
        this.cancelled = true;
    }
}
