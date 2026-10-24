export class Event {
    /**
     * Set to true if a subscriber has canceled the event.
     * @private
     */
    private canceled = false;

    /**
     * Is the event canceled
     * @returns {boolean} Whether the event is canceled
     */
    public isCanceled(): boolean {
        return this.canceled;
    }

    /**
     * Cancel the event
     */
    public preventDefault(): void {
        this.canceled = true;
    }
}
