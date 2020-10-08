class BaseEvent {
    #cancelled

    setCancelled(cancelled = true) {
        this.#cancelled = cancelled; 
    }

    isCancelled() {
        return this.#cancelled;
    }
}
module.exports = BaseEvent;
