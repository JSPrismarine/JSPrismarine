const Packet = require('./packet');
const Identifiers = require('./Identifiers').default;
const InetAddress = require('../utils/InetAddress').default;

class ConnectionRequestAccepted extends Packet {
    constructor() {
        super(Identifiers.ConnectionRequestAccepted);
    }

    #clientAddress;
    #requestTimestamp;
    #acceptedTimestamp;

    read() {
        super.read();
        this.#clientAddress = this.readAddress();
        this.readShort(); // unknown
        for (let i = 0; i < 20; i++) {
            this.readAddress();
        }
        this.#requestTimestamp = this.readLong();
        this.#acceptedTimestamp = this.readLong();
    }

    write() {
        super.write();
        this.writeAddress(this.#clientAddress);
        this.writeShort(0); // unknown
        let sysAddresses = [new InetAddress('127.0.0.1', 0, 4)];
        for (let i = 0; i < 20; i++) {
            this.writeAddress(
                sysAddresses[i] || new InetAddress('0.0.0.0', 0, 4)
            );
        }
        this.writeLong(this.#requestTimestamp);
        this.writeLong(this.#acceptedTimestamp);
    }

    get clientAddress() {
        return this.#clientAddress;
    }

    set clientAddress(clientAddress) {
        this.#clientAddress = clientAddress;
    }

    get requestTimestamp() {
        return this.#requestTimestamp;
    }

    set requestTimestamp(requestTimestamp) {
        this.#requestTimestamp = requestTimestamp;
    }

    get accpetedTimestamp() {
        return this.#acceptedTimestamp;
    }

    set accpetedTimestamp(accpetedTimestamp) {
        this.#acceptedTimestamp = accpetedTimestamp;
    }
}
module.exports = ConnectionRequestAccepted;
