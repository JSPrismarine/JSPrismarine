'use strict'

// Maybe using Buffers will speed up a little the process
class SubChunk {

    _ids
    _data
    _blockLight
    _skyLight

    static assignData(data, length, value = 0x00) {
        if (data.length !== length) {
            return new Array(length).fill(value)
        }
        return data
    }

    constructor(ids = [], data = [], skyLight = [], blockLight = []) {
        this._ids = SubChunk.assignData(ids, 4096)
        this._data = SubChunk.assignData(data, 2048)
        this._skyLight = SubChunk.assignData(skyLight, 2048, 0xff)
        this._blockLight = SubChunk.assignData(blockLight, 2048)
    }

    static getIdIndex(x, y, z) {
        return (x << 8) | (z << 4) | y
    }

    static getDataIndex(x, y, z) {
        return (x << 7) + (z << 3) + (y >> 1)
    }

    static getLightIndex(x, y, z) {
        return SubChunk.getDataIndex(x, y, z)
    }

    setBlockId(x, y, z, id) {
        this._ids[SubChunk.getIdIndex(x, y, z)] = id
        return true
    }

    getHighestBlockAt(x, z) {
        let low = (x << 8) | (z << 4)
        let i = low | 0x0f
        for (; i >= low; --i) {
            if (this._ids[i] !== 0x00) {
                return i & 0x0f
            }
        }

        return -1
    }

    toBinary() {
        return Buffer.from([0x00, ...this._ids, ...this._data])
    }
}
module.exports = SubChunk