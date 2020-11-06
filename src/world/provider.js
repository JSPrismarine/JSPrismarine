const fs = require('fs');

class Provider {
    /** @type {string} */
    #path;

    constructor(path) {
        this.#path = path;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    get path() {
        return this.#path;
    }
}
module.exports = Provider;
