import { itemStackRequestPacket } from '../wire/definitions/itemStackRequest';
import { layoutAt } from '../wire/WireLayout';

import type { ItemStackRequest } from '../wire/structures/ItemStackRequest';
import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * What the client wants done with the stacks it can see.
 *
 * With the server-authoritative inventory every inventory move arrives here: taking from the
 * creative menu, dragging between slots, dropping. The client will not commit any of it until
 * the server answers with an {@link ItemStackResponsePacket} naming the same Client Request
 * Id. Left unanswered, it puts everything back.
 *
 * Wire order (protocols 2193 and 2225): `Requests`, a varuint count followed by one
 * `ItemStackRequest` each. Its action ids are decoded using the negotiated version. See
 * `readItemStackRequest` for the layout of a request. The layout lives in the declarative
 * definition, which this class walks at the protocol version stamped on it.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/item-stack-request-packet/
 */
export default class ItemStackRequestPacket extends FieldNetworkPacket {
    /** Requests, in the order the client sent them. */
    public requests: ItemStackRequest[] = [];

    /** Writes Requests: a varuint count, then each request in full. */
    public encodePayload(): void {
        layoutAt(itemStackRequestPacket, this.codecProtocol).encode(this, {
            requestsUntil2225: this.requests,
            requestsSince2225: this.requests
        });
    }

    /**
     * Reads Requests: a varuint count, then each request in full.
     * @throws {RangeError} when the count is above what the docs allow, so a stranger's number
     * is refused rather than allocated for.
     */
    public decodePayload(): void {
        const { requestsUntil2225, requestsSince2225 } = layoutAt(itemStackRequestPacket, this.codecProtocol).decode(
            this
        );
        this.requests.push(...requestsUntil2225, ...requestsSince2225);
    }
}
