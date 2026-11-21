/**
 * The `/tickingarea` verbs of the server's command host, over the ticking areas of the level a
 * command runs in that belong to the command ({@link TickingAreas}).
 */
import type { CommandTickingArea, TickingAreaCommandHost } from '@jsprismarine/commands';

import type Server from '../../Server';
import type { TickingArea } from '../../world/TickingAreas';
import { chunksOfBlocks, COMMAND_TICKING_AREA_LIMIT } from '../../world/TickingAreas';
import { commandLevelOf, worldOf } from './support';

/**
 * Builds the ticking area verbs.
 * @param server - The live server, read when a command runs.
 */
export const tickingAreaCommandHost = (server: Server): TickingAreaCommandHost => {
    /** The ticking areas of the level a command's dimension is in. */
    const areas = (dimension: string | undefined) =>
        (
            (dimension === undefined ? undefined : commandLevelOf(server, dimension)) ??
            server.getWorldManager().getDefaultLevel()
        ).getTickingAreas();
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
            preload: area.preload === true
        };
    };
    /** The areas a `remove` or `preload` names, in a dimension. */
    const matching = (
        command: string,
        target: { readonly name: string } | { readonly position: { readonly x: number; readonly z: number } }
    ): TickingArea[] => {
        const dimension = dimensionOf(command);
        return areas(command)
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
    };

    return {
        add: (dimension, from, to, name, preload) => {
            const level = areas(dimension);
            if (level.list('command').length >= COMMAND_TICKING_AREA_LIMIT) return 'limit';
            let chosen = name;
            for (let index = 0; chosen === undefined; index++) {
                if (level.get('command', `Area${index}`) === undefined) chosen = `Area${index}`;
            }
            const added = level.add({
                name: chosen,
                owner: 'command',
                dimension: dimensionOf(dimension),
                chunks: chunksOfBlocks(from, to),
                ...(preload ? { preload } : {})
            });
            return added ? chosen : 'in-use';
        },
        remove: (dimension, target) =>
            matching(dimension, target).flatMap((area) =>
                areas(dimension).remove('command', area.name) ? [area.name] : []
            ),
        removeAll: (dimension) => {
            const within = dimensionOf(dimension);
            const level = areas(dimension);
            return level
                .list('command')
                .filter((area) => area.dimension === within)
                .flatMap((area) => (level.remove('command', area.name) ? [area.name] : []));
        },
        list: (dimension) => {
            const within = dimension === undefined ? undefined : dimensionOf(dimension);
            return areas(dimension)
                .list('command')
                .filter((area) => within === undefined || area.dimension === within)
                .map(reportOf);
        },
        // The areas are saved with the level and all start loading as it opens, so a preloaded
        // area differs only in what the command reports.
        setPreload: (dimension, target, preload) =>
            matching(dimension, target).map((area) => {
                areas(dimension).setPreload('command', area.name, preload);
                return area.name;
            })
    };
};
