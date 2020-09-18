const Prismarine = require("../../prismarine")
const PluginManifestType = require("./plugin-manifest-type")

class PluginType {

    /** @type {PluginManifestType} */
    manifest

    /** @type {function(Prismarine)} */
    main

    /** @type {String} */
    path
}

module.exports = PluginType