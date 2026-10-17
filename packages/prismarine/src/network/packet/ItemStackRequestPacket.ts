import Identifiers from '../Identifiers';
import type { ItemStackRequest } from '../type/ItemStackRequest';
import { readItemStackRequest } from '../type/ItemStackRequest';
import DataPacket from './DataPacket';

/**
 * What the client wants done with the stacks it can see.
 *
 * With the new inventory system every inventory move - taking from the creative menu,
 * dragging between slots, dropping - arrives here, and the client will not commit any of it
 * until the server answers with an {@link ItemStackResponsePacket} naming the same request
 * id. Left unanswered, it puts everything back.
 *
 * **Bound To:** Server
 */
export default class ItemStackRequestPacket extends DataPacket {
    public static NetID = Identifiers.ItemStackRequestPacket;

    public requests: ItemStackRequest[] = [];

    /**
     * This used to read the count and then nothing at all, leaving the whole payload on the
     * stream and the requests unknown - so no answer could be sent and no move ever took.
     */
    public decodePayload(): void {
        const count = this.readUnsignedVarInt();
        for (let i = 0; i < count; i++) {
            this.requests.push(readItemStackRequest(this));
        }
    }
}
