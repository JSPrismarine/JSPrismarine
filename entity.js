const Vector3 = require('./math/vector3')

'use strict'

// All entities will extend this base class
class Entity extends Vector3 {

    static runtimeIdCount = 0

    runtimeId

    constructor() {
        super()
        this.runtimeId = Entity.runtimeIdCount += 1
    }

}
module.exports = Entity