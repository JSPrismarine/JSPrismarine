import AcknowledgePacket from './AcknowledgePacket.js';
import { MessageIdentifiers } from './MessageIdentifiers.js';

export default class ACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.ACKNOWLEDGE_PACKET, buffer);
    }
}
