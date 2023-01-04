import AcknowledgePacket from './AcknowledgePacket.js';
import MessageHeaders from './MessageHeaders.js';

export default class NACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.NACKNOWLEDGE_PACKET, buffer);
    }
}
