import AcknowledgePacket from './AcknowledgePacket';
import MessageHeaders from './MessageHeaders';

export default class NACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.NACKNOWLEDGE_PACKET, buffer);
    }
}
