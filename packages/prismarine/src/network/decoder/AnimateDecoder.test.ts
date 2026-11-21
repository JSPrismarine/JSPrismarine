import AnimatePacket, { AnimateAction } from '@jsprismarine/protocol/bedrock/packet/AnimatePacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../testing/decodeView.test-utils';
import AnimateDecoder from './AnimateDecoder';

const SELF = 7n;

const animate = (
    fields: Pick<AnimatePacket, 'action' | 'data' | 'swingSource'> & Partial<Pick<AnimatePacket, 'runtimeEntityId'>>
): AnimatePacket => Object.assign(new AnimatePacket(), { runtimeEntityId: SELF }, fields);

describe('AnimateDecoder', () => {
    it('decodes a swing with its data and swing source', () => {
        const { view, logged } = decodeView();

        expect(
            new AnimateDecoder().decode(
                animate({ action: AnimateAction.Swing, data: 2.5, swingSource: 'attack' }),
                view
            )
        ).toStrictEqual([{ kind: 'animate', animation: 'swing', data: 2.5, swingSource: 'attack' }]);
        expect(logged).toEqual([]);
    });

    it('names each action a client sends', () => {
        const { view } = decodeView();
        const decoder = new AnimateDecoder();
        const nameOf = (action: number) =>
            decoder.decode(animate({ action, data: 0, swingSource: null }), view)[0]?.animation;

        expect(nameOf(AnimateAction.WakeUp)).toBe('wakeUp');
        expect(nameOf(AnimateAction.CriticalHit)).toBe('criticalHit');
        expect(nameOf(AnimateAction.MagicCriticalHit)).toBe('magicCriticalHit');
    });

    it('drops a packet that names another actor', () => {
        const { view, logged } = decodeView();

        expect(
            new AnimateDecoder().decode(
                animate({ runtimeEntityId: 8n, action: AnimateAction.Swing, data: 0, swingSource: null }),
                view
            )
        ).toEqual([]);
        expect(logged).toEqual([
            `Dropped animation ${AnimateAction.Swing} from tester: it names actor 8, not themselves`
        ]);
    });

    it('drops an action no client sends', () => {
        const { view, logged } = decodeView();

        expect(
            new AnimateDecoder().decode(animate({ action: AnimateAction.NoAction, data: 0, swingSource: null }), view)
        ).toEqual([]);
        expect(new AnimateDecoder().decode(animate({ action: 99, data: 0, swingSource: null }), view)).toEqual([]);
        expect(logged).toEqual([
            `Dropped animation ${AnimateAction.NoAction} from tester: not one a client sends`,
            'Dropped animation 99 from tester: not one a client sends'
        ]);
    });
});
