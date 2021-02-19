// Bit flags used to recognize packets by its header
const BitFlags = {
    VALID: 0x80,
    ACK: 0x40,
    NACK: 0x20,
    SPLIT: 0x10
};
export default BitFlags;
