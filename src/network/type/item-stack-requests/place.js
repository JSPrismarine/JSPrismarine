class Place {
    /** @type {number} */
    count;
    /** @type {number} */
    from;
    /** @type {number} */
    to;

    constructor({ count, from, to }) {
        this.count = count;
        this.from = from;
        this.to = to;
    }
}

module.exports = Place;
