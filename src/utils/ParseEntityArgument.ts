import Entity from '../entity/entity';

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

    if (targets.length <= 0) throw new Error('no results');

    switch (type) {
        case 'a':
            return targets.filter((entity) => entity.isPlayer());
        case 'e':
            return targets;
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
