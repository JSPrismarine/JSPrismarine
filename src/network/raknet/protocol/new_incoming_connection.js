const Packet = require("./packet");
const Identifiers = require('./Identifiers').default;

'use strict';

class NewIncomingConnection extends Packet {

    constructor() {
        super(Identifiers.NewIncomingConnection);
    }

    #address
    #systemAddresses = []

    #requestTimestamp
    #acceptedTimestamp

    read() {
        super.read();
        this.#address = this.readAddress();
        
        // Do not save in memory stuff we will not use
        for (let i = 0; i < 20; i++) {
            this.#systemAddresses.push(this.readAddress());
        }

        this.#requestTimestamp = this.readLong();
        this.#acceptedTimestamp = this.readLong();
    }

    write() {
        super.write();
        this.writeAddress(this.#address);
        for (let address of this.#systemAddresses) {
            this.writeAddress(address);
        }
        this.writeLong(this.#requestTimestamp);
        this.writeLong(this.#acceptedTimestamp);
    }

    get address() {
        return this.#address;
    }

    set address(address) {
        this.#address = address;
    }

    get systemAddresses() {
        return this.#systemAddresses;
    }

    set systemAddresses(systemAddresses) {
        this.#systemAddresses = systemAddresses;
    }

    get requestTimestamp() {
        return this.#requestTimestamp;
    }

    set requestTimestamp(requestTimestamp) {
        this.#requestTimestamp = requestTimestamp;
    }

    get acceptedTimestamp() {
        return this.#acceptedTimestamp;
    }

    set acceptedTimestamp(acceptedTimestamp) {
        this.#acceptedTimestamp = acceptedTimestamp;
    }
    
}
module.exports = NewIncomingConnection;
