export class Event {
    /**
     * Set to true if a subscriber has cancelled the event.
     * @private
     */
    private cancelled = false;

    /**
     * Is the event cancelled
     * @returns {boolean} Whether the event is cancelled
     */
    public isCancelled(): boolean {
        return this.cancelled;
    }

    /**
     * Cancel the event
     */
    public preventDefault(): void {
        this.cancelled = true;
    }
}
