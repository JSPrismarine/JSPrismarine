/**
 * `ItemStackRequestPacket`: what the client wants done with the stacks it can see.
 *
 * The payload is `Requests`, a varuint count followed by one `ItemStackRequest` each. A
 * request's action ids changed at protocol 2225, which inserted `CraftReservedAction` and
 * shifted the two deprecated craft actions, and a wire type has no protocol to consult. The list
 * is therefore declared twice, once per action id table, under the gates that admit each. Exactly
 * one travels at any version; the other stays empty.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/item-stack-request-packet/
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { readItemStackRequest, writeItemStackRequest } from '../structures/ItemStackRequest';
import { protocolVersion as protocolVersion2193 } from '../versions/v2193';
import { protocolVersion as protocolVersion2225 } from '../versions/v2225';
import { SINCE_2225, UNTIL_2225 } from '../wireGates';

import type { PayloadOf } from '../define';
import type { ItemStackRequest } from '../structures/ItemStackRequest';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/** The most requests one packet carries. The docs cap `Requests` at 100 entries. */
const MAX_REQUESTS = 100;

/**
 * `Requests` with action ids from the table of one protocol version.
 *
 * Reading refuses a count above {@link MAX_REQUESTS} with a `RangeError`, so a stranger's
 * number is refused rather than allocated for.
 */
const requestsAt = (protocolVersion: number) =>
    t.custom<ItemStackRequest[]>(
        'list<ItemStackRequest>',
        (stream, requests) => {
            stream.writeUnsignedVarInt(requests.length);
            for (const request of requests) writeItemStackRequest(stream, request, protocolVersion);
        },
        (stream) => {
            const count = stream.readUnsignedVarInt();
            if (count > MAX_REQUESTS) {
                throw new ProtocolWireErrors.TooManyItemStackRequests({
                    count,
                    maxRequests: MAX_REQUESTS
                });
            }

            const requests: ItemStackRequest[] = [];
            for (let i = 0; i < count; i++) requests.push(readItemStackRequest(stream, protocolVersion));
            return requests;
        }
    );

/** The fields the client sends to move, craft or drop item stacks. */
export const itemStackRequestPacket = definePacket('ItemStackRequestPacket', {
    /** `Requests` up to protocol 2193, with that version's action ids. */
    requestsUntil2225: gated(UNTIL_2225, requestsAt(protocolVersion2193), []),
    /** `Requests` from protocol 2225, with `CraftReservedAction` inserted into the action ids. */
    requestsSince2225: gated(SINCE_2225, requestsAt(protocolVersion2225), [])
});

/** Payload carried by `ItemStackRequestPacket`. */
export type ItemStackRequestPayload = PayloadOf<typeof itemStackRequestPacket>;
