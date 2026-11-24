import ClientboundMapItemDataPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';
import type MapInfoRequestPacket from '@jsprismarine/protocol/bedrock/packet/MapInfoRequestPacket';

import type { SavedMap } from '../../world/savedMap';
import { biomePreviewColors } from '../../world/savedMap';
import { mapItemDataOf } from '../mapItemData';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';

/**
 * Each map's biome preview, drawn the first time a client asks for the map and kept while the
 * map is: the preview is a function of the seed, so it is the same every time it is drawn.
 */
const previews = new WeakMap<SavedMap, Uint8Array>();

/**
 * A client asking for a map it holds and has no data for.
 *
 * The client sends this for a `filled_map` whose `map_uuid` it does not know, and draws the map
 * from the `ClientboundMapItemDataPacket` that answers it. A map the player's level never made
 * gets no answer and stays blank, and so does one of a dimension nobody has loaded, because a
 * read cannot build a world. The pixels the client offers are its own guesses at terrain, which
 * an explorer map does not take.
 */
export default class MapInfoRequestHandler implements ReadLaneHandler<MapInfoRequestPacket> {
    public static PacketName = 'MapInfoRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Sends the map's pixels and markers, or logs the id when the level has no such map. */
    public async handle(packet: MapInfoRequestPacket, { session, log }: SessionContext): Promise<void> {
        const level = session.getWorld().getLevel();
        const id = Number(packet.mapUniqueId);
        const map = Number.isSafeInteger(id) ? level.getMap(id) : undefined;
        if (map === undefined) {
            log.debug(`${session.identity.name} requested map ${packet.mapUniqueId}, which this level never made`);
            return;
        }

        const world = level.loadedWorld(map.dimension);
        if (world === undefined) {
            log.debug(`${session.identity.name} requested map ${id} of ${map.dimension}, which is not loaded`);
            return;
        }
        let colors = previews.get(map);
        if (colors === undefined) {
            colors = biomePreviewColors(map, (x, z) => world.isMapWaterAt(x, z));
            previews.set(map, colors);
        }

        const data = mapItemDataOf(id, map, world.getDimension().bedrockId, colors);
        log.debug(
            `Sent ${session.identity.name} map ${id}: ${data.decorations?.length ?? 0} marker(s), ${colors.filter((color) => color !== 0).length} drawn pixel(s)`
        );
        await session.send(new ClientboundMapItemDataPacket(data));
    }
}
