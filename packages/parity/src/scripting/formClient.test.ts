import { describe, expect, it } from 'vitest';

import { FormClientScript, isClientObservation, normalizeFormIds } from './formClient.ts';
import { diffScenarioRecords } from './record.ts';

describe("a scenario's form client", () => {
    it('answers each form with the next answer, leaves the rest open, and records every packet', () => {
        const script = new FormClientScript({ answers: [{ response: '0' }, { cancel: 'UserBusy' }] });

        expect(script.formRequested(1, 'a')).toEqual({ response: '0' });
        script.formsClosed();
        expect(script.formRequested(2, 'b')).toEqual({ cancel: 'UserBusy' });
        expect(script.formRequested(3, 'c')).toEqual({ ignore: true });
        expect(script.observations).toEqual([
            { packet: 'ModalFormRequest', formId: 1, json: 'a' },
            { packet: 'ClientboundCloseForm' },
            { packet: 'ModalFormRequest', formId: 2, json: 'b' },
            { packet: 'ModalFormRequest', formId: 3, json: 'c' }
        ]);
    });

    it('accepts only the two packet shapes in a golden', () => {
        expect(isClientObservation({ packet: 'ModalFormRequest', formId: 1, json: '{}' })).toBe(true);
        expect(isClientObservation({ packet: 'ClientboundCloseForm' })).toBe(true);
        expect(isClientObservation({ packet: 'ModalFormRequest', formId: 1 })).toBe(false);
        expect(isClientObservation({ packet: 'ClientboundCloseForm', extra: 1 })).toBe(false);
    });

    it('compares form ids by the order they first appear in', () => {
        expect(
            normalizeFormIds([
                { packet: 'ModalFormRequest', formId: 9, json: 'a' },
                { packet: 'ModalFormRequest', formId: 4, json: 'b' },
                { packet: 'ModalFormRequest', formId: 9, json: 'c' }
            ]).map((each) => ('formId' in each ? each.formId : undefined))
        ).toEqual([0, 1, 0]);
    });

    it('makes a record differ on the first client packet that does', () => {
        const bds = { observations: [], client: [{ packet: 'ModalFormRequest', formId: 1, json: 'a\n' }] } as const;
        const same = { observations: [], client: [{ packet: 'ModalFormRequest', formId: 5, json: 'a\n' }] } as const;
        const other = { observations: [], client: [{ packet: 'ModalFormRequest', formId: 1, json: 'b\n' }] } as const;

        expect(diffScenarioRecords(bds, same)).toBeUndefined();
        expect(diffScenarioRecords(bds, other)).toMatch(/^client packet 1 differs/);
        expect(diffScenarioRecords(bds, { observations: [] })).toMatch(/1 packets from BDS, 0 from JSPrismarine/);
    });
});
