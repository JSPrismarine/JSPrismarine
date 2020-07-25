'use strict'

class CoordinateUtils {

    static fromBlockToChunk(v) {
        return v << 4
    }

    static getChunkMin(v) {
        return v << 4
    }

    static getChunkMax(v) {
        return ((v + 1) << 4) - 1
    }

    static toLong(x, z) {
        return (x << 32) + z - Number.MIN_VALUE
    }
}
module.exports = CoordinateUtils