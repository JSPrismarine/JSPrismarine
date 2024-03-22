import AcknowledgePacket from './AcknowledgePacket';
import { MessageIdentifiers } from './MessageIdentifiers';

export default class ACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.ACKNOWLEDGE_PACKET, buffer);
    }
}
