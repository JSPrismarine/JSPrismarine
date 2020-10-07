const fs = require('fs');

'use strict';

class Provider {

    /** @type {string} */
    #path

    constructor(path) {
        this.#path = path;
        if (!(fs.existsSync(path))) {
            fs.mkdirSync(path);
        }
    }

    get path() {
        return this.#path;
    }

}
module.exports = Provider;
