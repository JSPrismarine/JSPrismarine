'use strict';

// Bit flags used to recognize packets by its header
const BitFlags = {
    Valid: 0x80,
    Ack: 0x40,
    Nack: 0x20,
    Split: 0x10
};
module.exports = BitFlags;
