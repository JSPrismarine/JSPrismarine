import AcknowledgePacket from './AcknowledgePacket';
import Identifiers from './Identifiers';

export default class ACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(Identifiers.AcknowledgePacket, buffer);
    }
}
