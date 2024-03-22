import AcknowledgePacket from './AcknowledgePacket';
import { MessageIdentifiers } from './MessageIdentifiers';

export default class NACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.NACKNOWLEDGE_PACKET, buffer);
    }
}
