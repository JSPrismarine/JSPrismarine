// http://www.jenkinssoftware.com/raknet/manual/reliabilitytypes.html
// Used to recognize packet reliability and know what to write in buffer
export enum PacketReliability {
    UNRELIABLE,
    UNRELIABLE_SEQUENCED,
    RELIABLE,
    RELIABLE_ORDERED,
    RELIABLE_SEQUENCED,
    UNRELIABLE_WITH_ACK_RECEIPT,
    UNRELIABLE_SEQUENCED_WITH_ACK_RECEIPT,
    RELIABLE_WITH_ACK_RECEIPT,
    RELIABLE_ORDERED_WITH_ACK_RECEIPT,
    RELIABLE_SEQUENCED_WITH_ACK_RECEIPT
}
export default PacketReliability;

export function isReliable(reliability: number): boolean {
    switch (reliability) {
        case PacketReliability.RELIABLE:
        case PacketReliability.RELIABLE_SEQUENCED:
        case PacketReliability.RELIABLE_ORDERED:
        case PacketReliability.RELIABLE_WITH_ACK_RECEIPT:
        case PacketReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT:
            return true;
        default:
            return false;
    }
}

export function isSequenced(reliability: number): boolean {
    switch (reliability) {
        case PacketReliability.UNRELIABLE_SEQUENCED:
        case PacketReliability.RELIABLE_SEQUENCED:
            return true;
        default:
            return false;
    }
}

export function isSequencedOrOrdered(reliability: number): boolean {
    switch (reliability) {
        case PacketReliability.UNRELIABLE_SEQUENCED:
        case PacketReliability.RELIABLE_SEQUENCED:
        case PacketReliability.RELIABLE_ORDERED:
        case PacketReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT:
            return true;
        default:
            return false;
    }
}
