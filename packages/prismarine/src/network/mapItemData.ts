/**
 * A saved map as the `ClientboundMapItemDataPacket` a Bedrock client draws it from.
 *
 * The client asks for a map by the `map_uuid` its item carries (`MapInfoRequestPacket`) and
 * draws whatever comes back: the pixels, and a marker for each decoration. A held map is sent the
 * pixels and markers that changed as it fills in. Which fields have to
 * be set, and how, follows GeyserMC's `JavaMapItemDataTranslator`, which draws Java maps on
 * Bedrock clients: the map's own id as the creation id, an origin of zero, one tracked actor per
 * decoration, Java's decoration bytes passed through as they are, and pixels with red in the low
 * byte.
 */
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import {
    MapDecorationType,
    MapItemTrackedActorType
} from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';
import type { ClientboundMapItemData } from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';

import type { MapUpdate } from '../world/mapCarriers';
import { bedrockPixelOf } from '../world/mapColors';
import type { SavedMap, SavedMapDecoration } from '../world/savedMap';
import { MAP_SIZE } from '../world/savedMap';

/** White, which leaves a marker's own artwork as it is. */
const UNTINTED = 0xffffffff;

/**
 * The Bedrock marker for each Java map decoration type, and its tint where it has one: GeyserMC's
 * `map_decorations.json`, short of the sixteen banner colors no explorer map draws.
 */
const BEDROCK_DECORATIONS: ReadonlyMap<string, { readonly type: MapDecorationType; readonly color?: number }> = new Map(
    [
        ['minecraft:player', { type: MapDecorationType.MarkerWhite }],
        ['minecraft:frame', { type: MapDecorationType.MarkerSign }],
        ['minecraft:red_marker', { type: MapDecorationType.MarkerRed }],
        ['minecraft:blue_marker', { type: MapDecorationType.MarkerBlue }],
        ['minecraft:target_x', { type: MapDecorationType.XWhite, color: 0xff000000 }],
        ['minecraft:target_point', { type: MapDecorationType.TriangleRed }],
        ['minecraft:player_off_map', { type: MapDecorationType.SquareWhite }],
        ['minecraft:player_off_limits', { type: MapDecorationType.SmallSquareWhite }],
        ['minecraft:mansion', { type: MapDecorationType.Mansion }],
        ['minecraft:monument', { type: MapDecorationType.Monument }],
        ['minecraft:red_x', { type: MapDecorationType.XWhite }],
        ['minecraft:village_desert', { type: MapDecorationType.VillageDesert }],
        ['minecraft:village_plains', { type: MapDecorationType.VillagePlains }],
        ['minecraft:village_savanna', { type: MapDecorationType.VillageSavanna }],
        ['minecraft:village_snowy', { type: MapDecorationType.VillageSnowy }],
        ['minecraft:village_taiga', { type: MapDecorationType.VillageTaiga }],
        ['minecraft:jungle_temple', { type: MapDecorationType.JungleTemple }],
        ['minecraft:swamp_hut', { type: MapDecorationType.WitchHut }],
        ['minecraft:trial_chambers', { type: MapDecorationType.TrialChambers }],
        ['minecraft:abandoned_camp', { type: MapDecorationType.AbandonedCamp }],
        ['minecraft:ancient_city', { type: MapDecorationType.BuriedAncientCity }],
        ['minecraft:mineshaft', { type: MapDecorationType.BuriedMineshaft }],
        ['minecraft:desert_pyramid', { type: MapDecorationType.DesertPyramid }],
        ['minecraft:ocean_ruin_warm', { type: MapDecorationType.WarmOceanRuins }]
    ]
);

/** A Java signed byte as the unsigned byte the Bedrock field holds, the same eight bits. */
const unsignedByte = (value: number): number => value & 0xff;

/**
 * The packet that sends one map, or the part of it that changed.
 *
 * @param mapId - The map's id, which is the `map_uuid` the client knows it by.
 * @param map - The saved map.
 * @param dimension - The Bedrock number of the dimension the map shows.
 * @param update - The pixels and markers to send; a part left out keeps what the client has.
 */
export const mapItemDataOf = (
    mapId: number,
    map: SavedMap,
    dimension: number,
    update: MapUpdate
): ClientboundMapItemData => {
    // A decoration Geyser has no marker for is left off rather than drawn as the wrong one.
    const decorations = update.decorations?.flatMap((decoration) => {
        const bedrock = BEDROCK_DECORATIONS.get(decoration.type);
        if (bedrock === undefined) return [];
        return [
            {
                imageType: bedrock.type,
                rotation: decoration.rotation & 0x0f,
                x: unsignedByte(decoration.x),
                y: unsignedByte(decoration.y),
                label: '',
                // The field is a signed little-endian int.
                color: (bedrock.color ?? UNTINTED) | 0
            }
        ];
    });
    const patch = update.patch;

    return {
        mapId: BigInt(mapId),
        dimension,
        isLocked: map.locked,
        mapOrigin: new BlockPos(0, 0, 0),
        creationMapIds: [BigInt(mapId)],
        scale: map.scale,
        // One tracked actor for each marker, numbered from zero, which the client pairs with it.
        trackedActorIds:
            decorations?.map((_decoration, index) => ({
                type: MapItemTrackedActorType.Entity,
                entityId: BigInt(index),
                blockPosition: null
            })) ?? null,
        decorations: decorations ?? null,
        width: patch?.width ?? null,
        height: patch?.height ?? null,
        startX: patch?.startX ?? null,
        startY: patch?.startY ?? null,
        pixels: patch === undefined ? null : Array.from(patch.colors, bedrockPixelOf)
    };
};

/** The whole of a map, as a client that has none of it is sent it. */
export const wholeMap = (colors: Uint8Array, decorations: readonly SavedMapDecoration[]): MapUpdate => ({
    patch: { startX: 0, startY: 0, width: MAP_SIZE, height: MAP_SIZE, colors },
    decorations
});
