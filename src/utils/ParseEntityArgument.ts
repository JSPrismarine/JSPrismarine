import Entity from '../entity/entity';
import Vector3 from '../math/Vector3';

// This should probably be a part of the Entity class
// Thanks to https://stackoverflow.com/a/63905383
const getNearestEntity = (target: Entity, entities: Entity[]) => {
    const pos = new Vector3(target.getX(), target.getY(), target.getZ());
    const dist = (a: Vector3, b: Vector3) =>
        Math.sqrt(
            (b.getX() - a.getX()) ** 2 +
                (b.getY() - a.getY()) ** 2 +
                (b.getZ() - a.getZ()) ** 2
        );

    const closest = (target: Vector3, points: Entity[], eps = 0.00001) => {
        const distances = points.map((e) =>
            dist(target, new Vector3(e.getX(), e.getY(), e.getZ()))
        );
        const closest = Math.min(...distances);
        return points.find((e, i) => distances[i] - closest < eps)!;
    };

    return [
        closest(
            pos,
            entities.filter((a) => a.runtimeId !== target.runtimeId)
        )
    ].filter((a) => a);
};

const ParseEntityArgument = ({
    input,
    entities,
    source
}: {
    input: string;
    entities: Entity[];
    source: Entity;
}): Entity[] => {
    if (!input.startsWith('@'))
        throw new Error('input does not start with "@"');

    let targets = entities;
    const str = input.slice(1, input.length);
    const type = str.split('[')[0];
    const args =
        str
            .split('[')[1]
            ?.split(']')[0]
            .split(',')
            .map((arg) => ({
                argument: arg.split('=')[0],
                value: arg.split('=')[1].replace('!', ''),
                reverse: arg.split('=')[1].startsWith('!')
            })) || [];

    args.forEach((filter) => {
        switch (filter.argument) {
            case 'type': {
                if (filter.value.split(':').length === 1)
                    targets = targets.filter((entity) =>
                        filter.reverse
                            ? entity.getType().split(':')[1] !== filter.value
                            : entity.getType().split(':')[1] === filter.value
                    );
                else
                    targets = targets.filter((entity) =>
                        filter.reverse
                            ? entity.getType() !== filter.value
                            : entity.getType() === filter.value
                    );
            }
            default:
                break;
        }
    });

    if (type !== 's' && targets.length <= 0) throw new Error('no results');

    switch (type) {
        case 'a':
            return targets.filter((entity) => entity.isPlayer());
        case 'e':
            return targets;
        case 'p':
            return getNearestEntity(
                source,
                targets.filter((entity) => entity.isPlayer())
            );
        case 'r':
            return [targets[Math.floor(Math.random() * targets.length)]];
        case 's':
            return [source];
        default:
            throw new Error(
                `type "${type}" is invalid. Expected "a", "e", "p", "r" or "s"`
            );
    }
};

export default ParseEntityArgument;
