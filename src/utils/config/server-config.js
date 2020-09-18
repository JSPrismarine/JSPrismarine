const ConfigBase = require("./config-base")
const path = require("path")

class ServerConfig extends ConfigBase {

    constructor() {
        super("./config.yml")
    }

}

module.exports = ServerConfig