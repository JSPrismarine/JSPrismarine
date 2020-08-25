const { parentPort } = require('worker_threads')
const Chunk = require('./chunk/chunk')

/* 
const CoordinateUtils = require('./coordinate_utils')

 parentPort.on('message', function(player) {
    while (true) {
        let currentXChunk = CoordinateUtils.fromBlockToChunk(player.x)
        let currentZChunk = CoordinateUtils.fromBlockToChunk(player.z)

        let viewDistance = player.viewDistance
        for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
            for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
                let distance = Math.sqrt(sendZChunk * sendZChunk + sendXChunk * sendXChunk)
                let chunkDistance = Math.round(distance)

                if (chunkDistance <= viewDistance) {
                    let hash = CoordinateUtils.toLong(currentXChunk + sendXChunk, currentZChunk + sendZChunk)
                    if (!player.chunks.includes(hash)) {
                        let chunk = new Chunk(currentXChunk + sendXChunk, currentZChunk + sendZChunk)
                        for (let x = 0; x < 16; x++) {
                            for (let z = 0; z < 16; z++) {
                                let y = 0
                                chunk.setBlockId(x, y++, z, 7)
                                chunk.setBlockId(x, y++, z, 3)
                                chunk.setBlockId(x, y++, z, 3)
                                chunk.setBlockId(x, y, z, 2)
                                // TODO: block light
                            }
            
                            chunk.recalculateHeightMap()
                            parentPort.postMessage({
                                chunkX: chunk.getChunkX(),
                                chunkZ: chunk.getChunkZ(),
                                subCount: chunk.getSubChunkSendCount(),
                                data: chunk.toBinary()
                            })

                            // Add into loaded chunks
                            player.chunks.push(hash)
                        }
                    }
                }
            } 
        }
    }
}) 
*/

parentPort.on('message', function(distance) {
    setImmediate(() => {
        for (let chunkX = -distance; chunkX <= distance; chunkX++) {
            for (let chunkZ = -distance; chunkZ <= distance; chunkZ++) {
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
            }
        }

        /* setInterval(function() {
            setImmediate(() => {
                for (let chunkX = 16; chunkX < 32; chunkX++) {
                    for (let chunkZ = 16; chunkZ < 32; chunkZ++) {
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
                    }
                }
            })
        }, 1000 * 5) */
    })

    /*
    player is just a copy of the real one 
    setInterval(function(player) {
        console.log(player)
        let playerChunkX = player.x << 4
        let playerChunkZ = player.z << 4
        console.log(playerChunkZ)
        for (let chunkX = -playerChunkX; chunkX <= distance; chunkX++) {
            for (let chunkZ = -playerChunkZ; chunkZ <= distance; chunkZ++) {

            }
        }
    }, 1000, player) 
    */
}) 
