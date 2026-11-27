import { describe, expect, it } from 'vitest';

import { sessionSeeingBlocks } from '../../editions/bedrock/handler/blockTargetSession.test.helper';
import TurnLecternPageHandler from './TurnLecternPageHandler';

const turn = { kind: 'turnLecternPage', position: { x: 4, y: 1, z: 2 }, page: 1, totalPages: 3 } as const;

describe('TurnLecternPageHandler', () => {
    it('logs the page and position of a lectern in reach', () => {
        const { logged, context } = sessionSeeingBlocks({ '4,1,2': 'minecraft:lectern' });

        new TurnLecternPageHandler().handle(turn, context);

        expect(logged.debug).toEqual([
            'Steve turned the lectern at 4, 1, 2 to page 1 of 3. Lectern pages are not stored'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no lectern', () => {
        const { logged, context } = sessionSeeingBlocks({ '4,1,2': 'minecraft:bookshelf' });

        new TurnLecternPageHandler().handle(turn, context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a lectern page turn from Steve at 4, 1, 2: the block there is minecraft:bookshelf'
        ]);
    });
});
