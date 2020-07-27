const { parentPort } = require('worker_threads')
const Chunk = require('./chunk')

parentPort.on('message', function(distance) {
    for (let chunkX = -distance; chunkX <= distance; chunkX++) {
        for (let chunkZ = -distance; chunkZ <= distance; chunkZ++) {
            // let hash = CoordinateUtils.toLong(chunkX, chunkZ)
            let chunk = new Chunk(chunkX, chunkZ)
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    let y = 0
                    chunk.setBlockId(x, y++, z, 7)
                    chunk.setBlockId(x, y++, z, 3)
                    chunk.setBlockId(x, y++, z, 3)
                    chunk.setBlockId(x, y, z, 2) 
                
                    // TODO: block light
                }
            }
    
            chunk.recalculateHeightMap()
            parentPort.postMessage({
                chunkX: chunk.getChunkX(),
                chunkZ: chunk.getChunkZ(),
                subCount: chunk.getSubChunkSendCount(),
                data: chunk.toBinary()
            })
            
            // this.sendChunk(chunk)
    
            // this.chunks.push(hash)
        }
    }
})
