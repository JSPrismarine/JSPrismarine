class Destroy {
    /** @type {number} */
    count;
    /** @type {number} */
    from;

    constructor({ count, from }) {
        this.count = count;
        this.from = from;
    }
}

module.exports = Destroy;
