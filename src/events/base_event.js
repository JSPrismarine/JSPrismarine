'use strict'

class BaseEvent {
    #cancelled

    setCancelled(v = true) {
        this.#cancelled = v 
    }

    isCancelled() {
        return this.#cancelled
    }
}
module.exports = BaseEvent