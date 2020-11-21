import AcknowledgePacket from './AcknowledgePacket';
import Identifiers from './Identifiers';

export default class NACK extends AcknowledgePacket {
    public constructor(buffer?: Buffer) {
        super(Identifiers.NacknowledgePacket, buffer);
    }
}
