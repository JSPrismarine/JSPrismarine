/**
 * The `/tickingarea` verbs of the server's command host, over the default level's ticking areas
 * that belong to the command ({@link TickingAreas}).
 */
import type { CommandTickingArea, TickingAreaCommandHost } from '@jsprismarine/commands';

import type Server from '../../Server';
import type { TickingArea } from '../../world/TickingAreas';
import { chunksOfBlocks, COMMAND_TICKING_AREA_LIMIT, tickingAreasOf } from '../../world/TickingAreas';
import { worldOf } from './support';

/**
 * Builds the ticking area verbs.
 * @param server - The live server, read when a command runs.
 */
export const tickingAreaCommandHost = (server: Server): TickingAreaCommandHost => {
    const areas = () => tickingAreasOf(server, server.getWorldManager().getDefaultLevel());
    /** The Bedrock name of the dimension a command names. */
    const dimensionOf = (dimension: string): string => worldOf(server, dimension).getDimension().bedrockName;
    const heightOf = (dimension: string) => {
        const type = worldOf(server, dimension).getDimension();
        return { min: type.minY, max: type.minY + type.height - 1 };
    };
    const reportOf = (area: TickingArea): CommandTickingArea => {
        const { min, max } = heightOf(area.dimension);
        return {
            name: area.name,
            dimension: area.dimension,
            from: { x: area.chunks.minX * 16, y: min, z: area.chunks.minZ * 16 },
            to: { x: area.chunks.maxX * 16 + 15, y: max, z: area.chunks.maxZ * 16 + 15 },
            preload: preloaded.has(area.name)
        };
    };
    /** The areas a `remove` or `preload` names, in a dimension. */
    const matching = (
        dimension: string,
        target: { readonly name: string } | { readonly position: { readonly x: number; readonly z: number } }
    ): TickingArea[] =>
        areas()
            .list('command')
            .filter((area) => {
                if ('name' in target) return area.name === target.name;
                const x = Math.floor(target.position.x) >> 4;
                const z = Math.floor(target.position.z) >> 4;
                return (
                    area.dimension === dimension &&
                    x >= area.chunks.minX &&
                    x <= area.chunks.maxX &&
                    z >= area.chunks.minZ &&
                    z <= area.chunks.maxZ
                );
            });
    // Preloading loads an area's chunks as the world starts; the areas are not saved yet, so
    // the flag is only kept and reported.
    const preloaded = new Set<string>();

    return {
        add: (dimension, from, to, name, preload) => {
            const level = areas();
            if (level.list('command').length >= COMMAND_TICKING_AREA_LIMIT) return 'limit';
            let chosen = name;
            for (let index = 0; chosen === undefined; index++) {
                if (level.get('command', `Area${index}`) === undefined) chosen = `Area${index}`;
            }
            const added = level.add({
                name: chosen,
                owner: 'command',
                dimension: dimensionOf(dimension),
                chunks: chunksOfBlocks(from, to)
            });
            if (!added) return 'in-use';
            if (preload) preloaded.add(chosen);
            return chosen;
        },
        remove: (dimension, target) =>
            matching(dimensionOf(dimension), target).flatMap((area) => {
                preloaded.delete(area.name);
                return areas().remove('command', area.name) ? [area.name] : [];
            }),
        removeAll: (dimension) => {
            const within = dimensionOf(dimension);
            return areas()
                .list('command')
                .filter((area) => area.dimension === within)
                .flatMap((area) => {
                    preloaded.delete(area.name);
                    return areas().remove('command', area.name) ? [area.name] : [];
                });
        },
        list: (dimension) => {
            const within = dimension === undefined ? undefined : dimensionOf(dimension);
            return areas()
                .list('command')
                .filter((area) => within === undefined || area.dimension === within)
                .map(reportOf);
        },
        setPreload: (dimension, target, preload) =>
            matching(dimensionOf(dimension), target).map((area) => {
                if (preload) preloaded.add(area.name);
                else preloaded.delete(area.name);
                return area.name;
            })
    };
};
