const BitFlags = require('./protocol/bitflags');
const InetAddress = require('./utils/inet_address');
const DataPacket = require('./protocol/data_packet');
const NACK = require('./protocol/nack');
const ACK = require('./protocol/ack');
const Identifiers = require('./protocol/identifiers');
const ConnectionRequest = require('./protocol/connection_request');
const ConnectionRequestAccepted = require('./protocol/connection_request_accepted');
const EncapsulatedPacket = require('./protocol/encapsulated_packet');
const NewIncomingConnection = require('./protocol/new_incoming_connection');
const ConnectedPing = require('./protocol/connected_ping');
const ConnectedPong = require('./protocol/connected_pong');
const BinaryStream = require('@jsprismarine/jsbinaryutils').default;

'use strict';

const Priority = {
    Normal: 0,
    Immediate: 1
};
const Status = {
    Connecting: 0,
    Connected: 1,
    Disconnecting: 2,
    Disconnected: 3
};
class Connection {

    #listener  
    /** @type {number} */
    #mtuSize
    /** @type {InetAddress} */
    #address

    // Client connection state
    #state = Status.Connecting

    // Queue containing sequence numbers of packets not received
    #nackQueue = []
    // Queue containing sequence numbers to let know the game packets we sent
    #ackQueue = []
    // Need documentation
    #recoveryQueue = new Map()
    // Need documentation
    #packetToSend = []
    // Queue holding packets to send 
    #sendQueue = new DataPacket()

    #splitPackets = new Map()

    // Need documentation
    #windowStart = -1
    #windowEnd = 2048
    #reliableWindowStart = 0
    #reliableWindowEnd = 2048
    #reliableWindow = new Map()
    #lastReliableIndex = -1

    // Array containing received sequence numbers
    #receivedWindow = []
    // Last received sequence number
    #lastSequenceNumber = -1
    #sendSequenceNumber = 0

    #messageIndex = 0
    #channelIndex = []

    #needACK = new Map()
    #splitID = 0

    // Last timestamp of packet received, helpful for timeout
    #lastUpdate = Date.now()
    #isActive = false

    constructor(listener, mtuSize, address) {
        this.#listener = listener;
        this.#mtuSize = mtuSize;
        this.#address = address;

        this.#lastUpdate = Date.now();

        for (let i = 0; i < 32; i++) {
            this.#channelIndex[i] = 0;
        }
    }

    update(timestamp) {
        if (!this.#isActive && (this.#lastUpdate + 10000) < timestamp) {
            this.disconnect('timeout');
            return;
        } 
        this.#isActive = false;

        // Send ACKs
        if (this.#ackQueue.length > 0) {
            let pk = new ACK();
            pk.packets = this.#ackQueue;
            this.sendPacket(pk);
            this.#ackQueue = [];
        }

        if (this.#nackQueue.length > 0) {
            let pk = new NACK();
            pk.packets = this.#nackQueue;
            this.sendPacket(pk);
            this.#nackQueue = [];
        }

        if (this.#packetToSend.length > 0) {
            let limit = 16;
            for (let pk of this.#packetToSend) {          
                pk.sendTime = timestamp;  // To implement
                pk.write();
                this.#recoveryQueue.set(pk.sequenceNumber, pk);
                let index = this.#packetToSend.indexOf(pk);
                this.#packetToSend.splice(index, 1);
                this.sendPacket(pk);

                if (--limit <= 0) {
                    break;
                }
            }

            // Packet queue bigger than limit
            if (this.#packetToSend.length > 2048) {
                this.#packetToSend = [];
            }
        }

        for (let [seq, pk] of this.#recoveryQueue) {
            if (pk.sendTime < (Date.now() - 8000)) {
                this.#packetToSend.push(pk);
                this.#recoveryQueue.delete(seq);
            }
        }

        for (let seq of this.#receivedWindow) {
            if (seq < this.#windowStart) {
                let index = this.#receivedWindow.indexOf(seq);
                this.#receivedWindow.splice(index, 1);
            } else {
                break;
            }
        }

        this.sendQueue();
    }

    disconnect(reason = 'unknown') {
        this.#listener.removeConnection(this, reason);
    }

    /**
     * Receive session packets
     * 
     * @param {Buffer} buffer 
     */
    receive(buffer) {
        this.#isActive = true;
        this.#lastUpdate = Date.now();
        let header = buffer.readUInt8();
        
        if ((header & BitFlags.Valid) == 0) {
            // Don't handle offline packets
            return null;
        } else if (header & BitFlags.Ack) {
            return this.handleACK(buffer);
        } else if (header & BitFlags.Nack) {
            return this.handleNACK(buffer);
        } else {
            return this.handleDatagram(buffer);
        }
    }

    handleDatagram(buffer) {
        let dataPacket = new DataPacket();
        dataPacket.buffer = buffer;
        dataPacket.read();

        // Check if we already received packet and so we don't handle them
        // i still need to understand what are those window stuff
        if (
            dataPacket.sequenceNumber < this.#windowStart || 
            dataPacket.sequenceNumber > this.#windowEnd || 
            this.#receivedWindow.includes(dataPacket.sequenceNumber)
        ) {
            return;
        }

        // Check if there are missing packets between the received packet and the last received one
        let diff = dataPacket.sequenceNumber - this.#lastSequenceNumber;

        // Check if the packet was a missing one, so in the nack queue
        // if it was missing, remove from the queue because we received it now
        let index = this.#nackQueue.indexOf(dataPacket.sequenceNumber);
        if (index > -1) {
            this.#nackQueue.splice(index, 1);
        }

        // Add the packet to the 'sent' queue
        // to let know the game we sent the packet
        this.#ackQueue.push(dataPacket.sequenceNumber);

        // Add the packet to the received window, a property that keeps
        // all the sequence numbers of packets we received
        // its function is to check if when we lost some packets
        // check wich are really lost by searching if we received it there
        this.#receivedWindow.push(dataPacket.sequenceNumber);

        // Check if the sequence is broken due to a lost packet
        if (diff !== 1) {
            // As i said before, there we search for missing packets in the list of the recieved ones
            for (let i = this.#lastSequenceNumber + 1; i < dataPacket.sequenceNumber; i++) {
                // Adding the packet sequence number to the NACK queue and then sending a NACK
                // will make the Client sending again the lost packet
                if (!this.#receivedWindow.includes(i)) {
                    this.#nackQueue.push(i);
                }
            }
        }

        // If we received a lost packet we sent in NACK or a normal sequenced one
        // needs more documentation for window start and end
        if (diff >= 1) {
            this.#lastSequenceNumber = dataPacket.sequenceNumber;
            this.#windowStart += diff;
            this.#windowEnd += diff;
        } 

        // Handle encapsulated
        // This is an array but soon 
        // will be converted to a porperty
        // because there is alway one packet
        for (let packet of dataPacket.packets) {
            this.receivePacket(packet);
        }
    }

    // Handles a ACK packet, this packet confirm that the other 
    // end successfully received the datagram
    handleACK(buffer) {
        let packet = new ACK();
        packet.buffer = buffer;
        packet.read();

        for (let seq of packet.packets) {
            if (this.#recoveryQueue.has(seq)) {
                // Calc ping maybe
                this.#recoveryQueue.delete(seq);
            }
        }
    }

    handleNACK(buffer) {
        let packet = new NACK();
        packet.buffer = buffer;
        packet.read();

        for (let seq of packet.packets) {
            if (this.#recoveryQueue.has(seq)) {
                let pk = this.#recoveryQueue.get(seq);
                pk.sequenceNumber = this.#sendSequenceNumber++;
                pk.sendTime = Date.now();
                pk.write();
                this.sendPacket(pk);

                this.#recoveryQueue.delete(seq);
            }
        }
    }

    /**
     * @param {EncapsulatedPacket} packet 
     */
    receivePacket(packet) {
        if (typeof packet.messageIndex === 'undefined') {
            // Handle the packet directly if it doesn't have a message index    
            this.handlePacket(packet);        
        } else {
            // Seems like we are checking the same stuff like before
            // but just with reliable packets
            if (
                packet.messageIndex < this.#reliableWindowStart ||
                packet.messageIndex > this.#reliableWindowEnd
            ) {
                return;
            }

            if ((packet.messageIndex - this.#lastReliableIndex) === 1) {
                this.#lastReliableIndex++;
                this.#reliableWindowStart++;
                this.#reliableWindowEnd++;
                this.handlePacket(packet);

                if (this.#reliableWindow.size > 0) {
                    let windows = [...this.#reliableWindow.entries()];
                    let reliableWindow = new Map();
                    windows.sort((a, b) => a[0] - b[0]);

                    for (const [k, v] of windows) {
                        reliableWindow.set(k, v);
                    }

                    this.#reliableWindow = reliableWindow;

                    for (let [seqIndex, pk] of this.#reliableWindow) {
                        if ((seqIndex - this.#lastReliableIndex) !== 1) {
                            break;
                        }
                        this.#lastReliableIndex++;
                        this.#reliableWindowStart++;
                        this.#reliableWindowEnd++;
                        this.handlePacket(pk);

                        this.#reliableWindow.delete(seqIndex);
                    }
                }
            } else {
                this.#reliableWindow.set(packet.messageIndex, packet);
            }
        }
    }

    /**
     * @param {EncapsulatedPacket} packet 
     * @param {number} flags 
     */
    addEncapsulatedToQueue(packet, flags = Priority.Normal) {
        if (packet.reliability === 2 ||
            packet.reliability === 3 ||
            packet.reliability === 4 ||
            packet.reliability === 6 ||
            packet.reliability === 7) {
            packet.messageIndex = this.#messageIndex++;

            if (packet.reliability === 3) {
                packet.orderIndex = this.#channelIndex[packet.orderChannel]++;
            }
            
        }

        if (packet.getTotalLength() + 4 > this.#mtuSize) {
            // Split the buffer into chunks
            let buffers = [], i = 0, splitIndex = 0;
            while (i < packet.buffer.length) {
                // Push format: [chunk index: int, chunk: buffer]
                buffers.push([(splitIndex += 1) - 1, packet.buffer.slice(i, i += this.#mtuSize - 60)]);
            }
            let splitID = ++this.#splitID % 65536;
            for (let [count, buffer] of buffers) {
                let pk = new EncapsulatedPacket();
                pk.splitID = splitID;
                pk.split = true;
                pk.splitCount = buffers.length;
                pk.reliability = packet.reliability;
                pk.splitIndex = count;
                pk.buffer = buffer;
                if (count > 0) {
                    pk.messageIndex = this.#messageIndex++;
                } else {
                    pk.messageIndex = packet.messageIndex;
                }
                if (pk.reliability === 3) {
                    pk.orderChannel = packet.orderChannel;
                    pk.orderIndex = packet.orderIndex;
                }
                this.addToQueue(pk, flags | Priority.Immediate);
            }
        } else {
            this.addToQueue(packet, flags);
        }
    } 
    

    /**
     * Adds a packet into the queue
     * 
     * @param {EncapsulatedPacket} pk 
     * @param {number} flags 
     */
    addToQueue(pk, flags = Priority.Normal) {
        let priority = flags & 0b1;
        if (priority === Priority.Immediate) {
            let packet = new DataPacket();
            packet.sequenceNumber = this.#sendSequenceNumber++;
            packet.packets.push(pk.toBinary());
            this.sendPacket(packet);
            packet.sendTime = Date.now();  
            this.#recoveryQueue.set(packet.sequenceNumber, packet);

            return;
        }
        let length = this.#sendQueue.length();
        if (length + pk.getTotalLength() > this.#mtuSize) {
            this.sendQueue();
        }

        this.#sendQueue.packets.push(pk.toBinary());
    }

    /**
     * Encapsulated handling route
     * 
     * @param {DataPacket} packet 
     */
    handlePacket(packet) {
        if (packet.split) {
            this.handleSplit(packet);
            return;
        }

        let id = packet.buffer.readUInt8();
        let dataPacket;

        if (id < 0x80) {
            if (this.#state === Status.Connecting) {
                if (id === Identifiers.ConnectionRequest) {
                    this.handleConnectionRequest(packet.buffer).then(encapsulated => {
                        this.addToQueue(encapsulated, Priority.Immediate);
                    });
                } else if (id === Identifiers.NewIncomingConnection) {
                    dataPacket = new NewIncomingConnection();
                    dataPacket.buffer = packet.buffer;
                    dataPacket.read();

                    let serverPort = this.#listener.socket.address().port;
                    if (dataPacket.address.port === serverPort) {
                        this.#state = Status.Connected;
                        this.#listener.emit('openConnection', this);
                    } 
                } 
            } else if (id === Identifiers.DisconnectNotification) {
                this.disconnect('client disconnect');
            } else if (id === Identifiers.ConnectedPing) {
                this.handleConnectedPing(packet.buffer).then(encapsulated => {
                    this.addToQueue(encapsulated);
                });
            }
        } else if (this.#state === Status.Connected) {
            this.#listener.emit('encapsulated', packet, this.#address);  // To fit in software needs later
        }
    }

    // Async encapsulated handlers

    async handleConnectionRequest(buffer) {
        let dataPacket = new ConnectionRequest();
        dataPacket.buffer = buffer;
        dataPacket.read();

        let pk = new ConnectionRequestAccepted();
        pk.clientAddress = this.#address;
        pk.requestTimestamp = dataPacket.requestTimestamp;
        pk.accpetedTimestamp = BigInt(Date.now());
        pk.write();

        let sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = pk.buffer;

        return sendPacket;
    }

    async handleConnectedPing(buffer) {
        let dataPacket = new ConnectedPing();
        dataPacket.buffer = buffer;
        dataPacket.read();

        let pk = new ConnectedPong();
        pk.clientTimestamp = dataPacket.clientTimestamp;
        pk.serverTimestamp = BigInt(Date.now());
        pk.write();

        let sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = pk.buffer;

        return sendPacket;
    } 

    /**
     * Handles a splitted packet.
     * 
     * @param {EncapsulatedPacket} packet 
     */
    handleSplit(packet) {
        if (this.#splitPackets.has(packet.splitID)) {
            let value = this.#splitPackets.get(packet.splitID);
            value.set(packet.splitIndex, packet);
            this.#splitPackets.set(packet.splitID, value);
        } else {
            this.#splitPackets.set(packet.splitID, new Map([[packet.splitIndex, packet]]));
        }

        // If we have all pieces, put them together
        let localSplits = this.#splitPackets.get(packet.splitID);
        if (localSplits.size === packet.splitCount) {
            let pk = new EncapsulatedPacket();
            let stream = new BinaryStream();
            for (let packet of localSplits.values()) {
                stream.append(packet.buffer);
            }
            this.#splitPackets.delete(packet.splitID);
        
            pk.buffer = stream.buffer;
            this.receivePacket(pk);
        }
    }

    sendQueue() {
        if (this.#sendQueue.packets.length > 0) {
            this.#sendQueue.sequenceNumber = this.#sendSequenceNumber++;
            this.sendPacket(this.#sendQueue);
            this.#sendQueue.sendTime = Date.now();  
            this.#recoveryQueue.set(this.#sendQueue.sequenceNumber, this.#sendQueue);
            this.#sendQueue = new DataPacket();
        }
    }

    sendPacket(packet) {
        packet.write();
        this.#listener.sendBuffer(packet.buffer, this.#address.address, this.#address.port);
    }

    close() {
        let stream = new BinaryStream(Buffer.from('\x00\x00\x08\x15', 'binary'));
        this.addEncapsulatedToQueue(EncapsulatedPacket.fromBinary(stream), Priority.Immediate);  // Client discconect packet 0x15
    }

    get address() {
        return this.#address;
    }
    
}
module.exports = Connection;
