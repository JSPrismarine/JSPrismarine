import AcknowledgePacket from './AcknowledgePacket';
import MessageHeaders from './MessageHeaders';

export default class ACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.ACKNOWLEDGE_PACKET, buffer);
    }
}
