const SubChunk = require('./SubChunk').default;

class EmptySubChunk extends SubChunk {
    setBlockId(_x, _y, _z) {
        return false;
    }

    getHighestBlockAt(_x, _z) {
        return 0;
    }

    toBinary() {
        return Buffer.alloc(6145).fill(0x00);
    }
}
module.exports = EmptySubChunk;
