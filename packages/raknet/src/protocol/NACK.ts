import AcknowledgePacket from './AcknowledgePacket.js';
import { MessageIdentifiers } from './MessageIdentifiers.js';

export default class NACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.NACKNOWLEDGE_PACKET, buffer);
    }
}
