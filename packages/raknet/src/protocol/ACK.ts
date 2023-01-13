import AcknowledgePacket from './AcknowledgePacket.js';
import MessageHeaders from './MessageHeaders.js';

export default class ACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.ACKNOWLEDGE_PACKET, buffer);
    }
}
