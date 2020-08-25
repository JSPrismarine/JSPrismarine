const path = require('path')
const level = require('level')

const Provider = require('../provider')

'use strict'

const Tags = {
    Version: 'v'
}
class LevelDB extends Provider{

    /** @type {level} */
    db

    constructor(levelPath) {
        super(levelPath)
        this.db = new level(path.join(levelPath, 'db'))

        // this.readChunk(0, 0)
    }

    readChunk(chunkX, chunkZ) {
        // let index = LevelDB.chunkIndex(chunkX, chunkZ)
        // let chunkVersion = this.db.get('', function(error, result) {
        //     if (error) console.log('Error', error)
        //     console.log(result)
        // })
    }

    static chunkIndex(chunkX, chunkZ) {}
}
module.exports = LevelDB