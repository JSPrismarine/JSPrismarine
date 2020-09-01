const { parentPort } = require('worker_threads')
const Chunk = require('./chunk/chunk')
const CoordinateUtils = require('./coordinate-utils')

parentPort.on('message', function({chunkX, chunkZ}) {
    let chunk = new Chunk(chunkX, chunkZ)
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            let y = 0
            chunk.setBlockId(x, y++, z, 7)
            chunk.setBlockId(x, y++, z, 3)
            chunk.setBlockId(x, y++, z, 3)
            chunk.setBlockId(x, y, z, 2) 
        }
    }
        
    chunk.recalculateHeightMap()
    parentPort.postMessage({
        chunkX: chunk.getChunkX(),
        chunkZ: chunk.getChunkZ(),
        subCount: chunk.getSubChunkSendCount(),
        data: chunk.toBinary(),
        hash: CoordinateUtils.chunkHash(chunkX, chunkZ)
    })
})