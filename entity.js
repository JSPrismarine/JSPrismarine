'use strict'

// All entities will extend this base class
class Entity {

    static runtimeIdCount = 0

    runtimeId

    constructor() {
        this
    }

}
module.exports = Entity