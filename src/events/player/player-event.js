const BaseEvent = require('../base-event');

'use strict';

class PlayerEvent extends BaseEvent {
    #player

    constructor(player) {
        super();
        this.#player = player;
    }

    getPlayer() {
        return this.#player;
    }
}
module.exports = PlayerEvent;