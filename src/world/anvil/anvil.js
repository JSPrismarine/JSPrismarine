const { MOB_ID } = require('../../entity/entity');
const Provider = require('../Provider');


class Anvil extends Provider {

    async readChunk(x, z) {
        let regionX = x >> 5;
        let regionZ = z >> 5;
    }

}
module.exports = Anvil;
