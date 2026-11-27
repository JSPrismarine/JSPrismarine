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

    it('accepts only the form packet shapes in a golden', () => {
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

    it('plays each data-driven screen its answer, and reports the screens the server closes', () => {
        const script = new FormClientScript({
            answers: [],
            screens: [
                { actions: [{ write: 'layout[0].onClick', value: 1 }] },
                { actions: [], acknowledge: false },
                { actions: [{ close: 'clientcanceled' }] }
            ]
        });

        expect(script.screenShown('minecraft:custom_form', 4, 77)).toEqual({
            property: 'custom_form_data_77',
            formId: 4,
            actions: [{ write: 'layout[0].onClick', value: 1 }]
        });
        expect(script.screenShown('minecraft:message_box', 5, 78).property).toBe('message_box_data_78');
        expect(script.screenShown('minecraft:custom_form', 6, 79).actions).toEqual([{ close: 'clientcanceled' }]);
        expect(script.screenClosed(null)).toEqual([{ formId: 4, reason: 'programmaticcloseall' }]);
        expect(script.screenClosed(4)).toEqual([]);
        expect(script.observations.at(-1)).toEqual({ packet: 'CloseScreen', formId: 4 });
    });

    it("counts a write from the property's and the path's last update", () => {
        const script = new FormClientScript({ answers: [] });
        script.dataStore([
            {
                type: 1,
                change: {
                    dataStoreName: 'minecraft',
                    property: 'custom_form_data_1',
                    updateCount: 2,
                    value: { type: 6, value: [{ key: 'length', value: { type: 2, value: 0n } }] }
                }
            },
            {
                type: 0,
                update: {
                    dataStoreName: 'minecraft',
                    property: 'custom_form_data_1',
                    path: 'title',
                    data: { type: 2, value: 'x' },
                    propertyUpdateCount: 2,
                    pathUpdateCount: 3
                }
            }
        ]);
        expect(script.written('custom_form_data_1', 'title')).toEqual({ propertyUpdateCount: 2, pathUpdateCount: 4 });
        expect(script.written('custom_form_data_1', 'layout[0].value')).toEqual({
            propertyUpdateCount: 2,
            pathUpdateCount: 1
        });
        expect(script.observations[0]).toEqual({
            packet: 'DataStoreChange',
            dataStore: 'minecraft',
            property: 'custom_form_data_1',
            updateCount: 2,
            value: { length: { $int64: '0' } }
        });
        expect(script.observations.every(isClientObservation)).toBe(true);
    });

    it('renumbers data instance ids and the properties named after them by first appearance', () => {
        const normalized = normalizeFormIds([
            {
                packet: 'DataStoreChange',
                dataStore: 'minecraft',
                property: 'custom_form_data_93',
                updateCount: 1,
                value: null
            },
            { packet: 'ShowScreen', screenId: 'minecraft:custom_form', formId: 12, instance: 93 },
            { packet: 'CloseScreen', formId: 12 },
            { packet: 'CloseScreen', formId: null }
        ]);
        expect(normalized).toEqual([
            {
                packet: 'DataStoreChange',
                dataStore: 'minecraft',
                property: 'custom_form_data_0',
                updateCount: 1,
                value: null
            },
            { packet: 'ShowScreen', screenId: 'minecraft:custom_form', formId: 0, instance: 0 },
            { packet: 'CloseScreen', formId: 0 },
            { packet: 'CloseScreen', formId: null }
        ]);
    });
});
