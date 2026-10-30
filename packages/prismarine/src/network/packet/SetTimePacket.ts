import { layoutAt, setTimePacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * Tells the client the world time, at login and whenever it changes.
 *
 * Protocol 2193 layout (docs id 10):
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Time | varint32 | ZigZag encoded; the world tick |
 */
export default class SetTimePacket extends DataPacket {
    public time!: number;

    public decodePayload(): void {
        Object.assign(this, layoutAt(setTimePacket, this.codecProtocol).decode(this));
    }

    public encodePayload(): void {
        layoutAt(setTimePacket, this.codecProtocol).encode(this, this);
    }
}
