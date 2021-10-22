// http://www.jenkinssoftware.com/raknet/manual/reliabilitytypes.html
export enum FrameReliability {
    UNRELIABLE,
    UNRELIABLE_SEQUENCED,
    RELIABLE,
    RELIABLE_ORDERED,
    RELIABLE_SEQUENCED,
    UNREALIABLE_WITH_ACK_RECEIPT,
    RELIABLE_WITH_ACK_RECEIPT,
    RELIABLE_ORDERED_WITH_ACK_RECEIPT
}
export default FrameReliability;
