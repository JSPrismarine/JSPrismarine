import type { ItemStackRequest } from '../wire/structures/ItemStackRequest';
import { readItemStackRequest, writeItemStackRequest } from '../wire/structures/ItemStackRequest';
import FieldNetworkPacket from '../FieldNetworkPacket';

/** The most requests one packet carries. The docs cap `Requests` at 100 entries. */
const MAX_REQUESTS = 100;

/**
 * What the client wants done with the stacks it can see.
 *
 * With the server-authoritative inventory every inventory move arrives here: taking from the
 * creative menu, dragging between slots, dropping. The client will not commit any of it until
 * the server answers with an {@link ItemStackResponsePacket} naming the same Client Request
 * Id. Left unanswered, it puts everything back.
 *
 * Wire order (protocol 2193): `Requests`, a varuint count followed by one `ItemStackRequest`
 * each. See `readItemStackRequest` for the layout of a request.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/item-stack-request-packet/
 */
export default class ItemStackRequestPacket extends FieldNetworkPacket {
    /** Requests, in the order the client sent them. */
    public requests: ItemStackRequest[] = [];

    /** Writes Requests: a varuint count, then each request in full. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.requests.length);
        for (const request of this.requests) {
            writeItemStackRequest(this, request);
        }
    }

    /**
     * Reads Requests: a varuint count, then each request in full.
     * @throws {RangeError} when the count is above what the docs allow, so a stranger's number
     * is refused rather than allocated for.
     */
    public decodePayload(): void {
        const count = this.readUnsignedVarInt();
        if (count > MAX_REQUESTS) {
            throw new RangeError(
                `An item stack request packet names ${count} requests; the docs allow at most ${MAX_REQUESTS}`
            );
        }

        for (let i = 0; i < count; i++) {
            this.requests.push(readItemStackRequest(this));
        }
    }
}
