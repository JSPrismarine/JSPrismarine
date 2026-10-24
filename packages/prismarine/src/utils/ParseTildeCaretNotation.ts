import type { Entity } from '../entity/Entity';

const ParseTildeCaretNotation = ({
    input,
    type,
    source
}: {
    input: string;
    type: 'x' | 'y' | 'z';
    source: Entity;
}): number => {
    if (!input.startsWith('~') && !input.startsWith('^')) return Number.parseFloat(input);

    switch (input[0]) {
        case '~': {
            const position = source.getPosition();
            const base = type === 'x' ? position.getX() : type === 'y' ? position.getY() : position.getZ();
            return base + Number.parseFloat(input.slice(1, input.length) || '0');
        }
        case '^':
            // FIXME:
            return Number.parseFloat(input.slice(1, input.length) || '0');
        default:
            throw new Error(`invalid input`);
    }
};

export default ParseTildeCaretNotation;
