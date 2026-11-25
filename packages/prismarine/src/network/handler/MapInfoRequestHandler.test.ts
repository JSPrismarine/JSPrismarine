import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import ClientboundMapItemDataPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';
import MapInfoRequestPacket from '@jsprismarine/protocol/bedrock/packet/MapInfoRequestPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type { Level } from '../../world/Level';
import type { World } from '../../world/World';
import { newSavedMap } from '../../world/savedMap';
import type PlayerSession from '../../player/PlayerSession';
import MapInfoRequestHandler from './MapInfoRequestHandler';

/** The treasure map a shipwreck chest makes, saved under id 4. */
const TREASURE = newSavedMap({
    dimension: 'minecraft:overworld',
    x: 400,
    z: -800,
    scale: 1,
    decorations: { '+': { type: 'minecraft:red_x', x: 400, z: -800, rotation: 180 } }
});

/** A session in a level that holds {@link TREASURE}, recording what it is sent and logs. */
const sessionWith = (loaded: boolean) => {
    const sent: NetworkPacket<unknown>[] = [];
    const logged: string[] = [];
    const world = stub<World>({
        getDimension: () => stub({ bedrockId: 0 }),
        // Water to the west of x 320, so the preview has a coast to draw.
        isMapWaterAt: (x: number) => x < 320
    });
    const level = stub<Level>({
        getMap: (id: number) => (id === 4 ? TREASURE : undefined),
        loadedWorld: (dimension: string) => (loaded && dimension === 'minecraft:overworld' ? world : undefined)
    });
    const session = stub<PlayerSession>({
        identity: STEVE,
        getWorld: () => stub<World>({ getLevel: () => level }),
        send: async (packet: NetworkPacket<unknown>) => void sent.push(packet)
    });
    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    return { context: sessionContext(session, { log }), sent, logged };
};

const request = (mapUniqueId: bigint): MapInfoRequestPacket =>
    Object.assign(new MapInfoRequestPacket(), { mapUniqueId, clientPixels: [] });

describe('MapInfoRequestHandler', () => {
    it('answers a map the level made with its markers and pixels', async () => {
        const { context, sent } = sessionWith(true);

        await new MapInfoRequestHandler().handle(request(4n), context);

        expect(sent).toHaveLength(1);
        const answer = sent[0];
        expect(answer).toBeInstanceOf(ClientboundMapItemDataPacket);
        if (!(answer instanceof ClientboundMapItemDataPacket)) return;
        const data = answer.getPacketData();
        expect(data?.mapId).toBe(4n);
        expect(data?.decorations).toHaveLength(1);
        // The coast is drawn: some pixel is opaque.
        expect(data?.pixels?.some((pixel) => pixel !== 0)).toBe(true);
    });

    it('sends nothing for a map the level never made', async () => {
        const { context, sent, logged } = sessionWith(true);

        await new MapInfoRequestHandler().handle(request(9n), context);

        expect(sent).toEqual([]);
        expect(logged).toEqual(['Steve requested map 9, which this level never made']);
    });

    it('sends nothing for a map of a dimension nobody has loaded, since a read builds no world', async () => {
        const { context, sent } = sessionWith(false);

        await new MapInfoRequestHandler().handle(request(4n), context);

        expect(sent).toEqual([]);
    });
});
