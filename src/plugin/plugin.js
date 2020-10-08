const Prismarine = require('../prismarine');
const PluginManifest = require('./plugin-manifest');


class Plugin {

    /** @type {PluginManifest} */
    manifest

    /** @type {function(Prismarine)} */
    main

    /** @type {string} */
    path
    
}
module.exports = Plugin;
