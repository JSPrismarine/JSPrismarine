import Identifiers from '../Identifiers';
import type { ItemStackRequest } from '../type/ItemStackRequest';
import { readItemStackRequest } from '../type/ItemStackRequest';
import DataPacket from './DataPacket';

/**
 * What the client wants done with the stacks it can see.
 *
 * With the server-authoritative inventory every inventory move arrives here: taking from the
 * creative menu, dragging between slots, dropping. The client will not commit any of it until
 * the server answers with an {@link ItemStackResponsePacket} naming the same Client Request
 * Id. Left unanswered, it puts everything back.
 *
 * Wire order (protocol 2193): Requests, a varuint count followed by one `ItemStackRequest`
 * each. See `readItemStackRequest` for the layout of a request.
 *
 * **Bound To:** Server
 */
export default class ItemStackRequestPacket extends DataPacket {
    public static NetID = Identifiers.ItemStackRequestPacket;

    /** Requests, in the order the client sent them. */
    public requests: ItemStackRequest[] = [];

    /** Reads Requests: a varuint count, then each request in full. */
    public decodePayload(): void {
        const count = this.readUnsignedVarInt();
        for (let i = 0; i < count; i++) {
            this.requests.push(readItemStackRequest(this));
        }
    }
}
