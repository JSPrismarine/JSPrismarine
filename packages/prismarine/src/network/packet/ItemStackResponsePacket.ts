import { ItemStackResponseResult } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import type { FullContainerName } from '../type/ItemStackRequest';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

// `ItemStackResponseResult` is generated from Mojang's documentation, where it is
// `ItemStackNetResult`. It carries sixty-eight reasons a request can fail; this server sends
// two of them, and every refusal it makes could be naming one of the rest.
export { ItemStackResponseResult };

/** What a slot holds once the request has been applied. */
export interface ItemStackResponseSlotInfo {
    slot: number;
    hotbarSlot: number;
    count: number;
    itemStackId: number;
    customName: string;
    durabilityCorrection: number;
}

/** The slots of one container that the request touched. */
export interface ItemStackResponseContainerInfo {
    container: FullContainerName;
    slots: ItemStackResponseSlotInfo[];
}

/** The server's answer to one request, matched to it by id. */
export interface ItemStackResponse {
    result: ItemStackResponseResult;
    requestId: number;
    containers: ItemStackResponseContainerInfo[];
}

/**
 * The answer to an {@link ItemStackRequestPacket}.
 *
 * A rejected request carries no containers - the client already knows what to put back - so
 * only an accepted one describes slots.
 *
 * The layout is protocol 2193's, which differs from 748's in three optionals: the container
 * list has a presence byte (written false, not left out, for a refusal), a slot's stack net
 * id has one and is sent only when it is positive, and a filtered custom name follows the
 * custom name, absent unless the server filtered it. 2168 wrote each of those presence bytes
 * twice; 2193 took the redundant one back out.
 *
 * **Bound To:** Client
 */
export default class ItemStackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ItemStackResponsePacket;

    public responses: ItemStackResponse[] = [];

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.responses.length);
        for (const response of this.responses) {
            this.writeByte(response.result);
            this.writeVarInt(response.requestId);

            const containers = response.result === ItemStackResponseResult.OK ? response.containers : [];
            this.writeBoolean(containers.length > 0);
            if (containers.length === 0) continue;

            this.writeUnsignedVarInt(containers.length);
            for (const container of containers) {
                this.writeByte(container.container.containerId);
                this.writeBoolean(container.container.dynamicId !== null);
                if (container.container.dynamicId !== null) this.writeIntLE(container.container.dynamicId);

                this.writeUnsignedVarInt(container.slots.length);
                for (const slot of container.slots) {
                    this.writeByte(slot.slot);
                    this.writeByte(slot.hotbarSlot);
                    this.writeByte(slot.count);
                    this.writeBoolean(slot.itemStackId > 0);
                    if (slot.itemStackId > 0) this.writeVarInt(slot.itemStackId);
                    NetworkUtil.writeString(this, slot.customName);
                    this.writeBoolean(false); // No filtered custom name: nothing here filters.
                    this.writeVarInt(slot.durabilityCorrection);
                }
            }
        }
    }
}
