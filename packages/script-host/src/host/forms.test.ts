import { describe, expect, it } from 'vitest';

import { ScriptApiError } from '../errors';
import { writeBdsJsonValue } from './formJson';
import type { FormKind, FormParts, PlainValue } from './forms';
import { buildForm, formChange, formText, readFormResponse } from './forms';

/** Builds a form from builder calls the way the host does: each call a fragment, then the document. */
const build = (kind: FormKind, major: number, calls: readonly [string, ...PlainValue[]][]): string => {
    const fields: Record<string, string> = {};
    const elements: [string, string][] = [];
    for (const [member, ...args] of calls) {
        const change = formChange(kind, member, args, major);
        if ('field' in change) fields[change.field] = writeBdsJsonValue(change.json);
        else elements.push([change.element, writeBdsJsonValue(change.json)]);
    }
    const parts: FormParts = { fields, elements };
    return buildForm(kind, major, parts).json;
};

// Every expected document below is what the pinned BDS sent, from the scripting.ui goldens.
describe('building a form as BDS writes it', () => {
    it('writes an action form with its buttons, icons, header, label and divider in order', () => {
        expect(
            build('action', 2, [
                ['title', 'Action title'],
                ['body', 'Body'],
                ['button', 'Plain', null],
                ['button', 'With icon', 'textures/items/apple'],
                ['header', 'A header'],
                ['label', 'A label'],
                ['divider'],
                ['button', { translate: 'gui.ok' }, '']
            ])
        ).toBe(
            '{"content":"Body","elements":[{"image":null,"text":"Plain","type":"button"},' +
                '{"image":{"data":"textures/items/apple","type":"path"},"text":"With icon","type":"button"},' +
                '{"text":"A header","type":"header"},{"text":"A label","type":"label"},{"text":"","type":"divider"},' +
                '{"image":{"data":"","type":"path"},"text":{"rawtext":[{"translate":"gui.ok"}]},"type":"button"}],' +
                '"title":"Action title","type":"form"}\n'
        );
    });

    it('writes the defaults of a form with nothing set', () => {
        expect(build('action', 2, [])).toBe('{"content":"","elements":null,"title":"","type":"form"}\n');
        expect(build('modal', 2, [])).toBe('{"content":null,"icon":null,"title":"","type":"custom_form"}\n');
        expect(build('message', 2, [])).toBe('{"button1":"","button2":"","content":"","title":"","type":"modal"}\n');
    });

    it('writes a modal form from the version 2 options objects', () => {
        expect(
            build('modal', 2, [
                ['title', 'Modal'],
                ['textField', 'Name', 'placeholder', { defaultValue: 'Steve', tooltip: 'Your name' }],
                [
                    'dropdown',
                    'Pick',
                    ['a', { translate: 'gui.ok' }, 'c'],
                    { defaultValueIndex: 2, tooltip: 'One of three' }
                ],
                ['slider', 'Amount', 0, 10, { valueStep: 2, defaultValue: 4, tooltip: 'Even only' }],
                ['toggle', 'On', { defaultValue: true, tooltip: 'Flip it' }],
                ['submitButton', 'Send']
            ])
        ).toBe(
            '{"content":[{"default":"Steve","placeholder":"placeholder","text":"Name","tooltip":"Your name","type":"input"},' +
                '{"default":2,"options":["a",{"rawtext":[{"translate":"gui.ok"}]},"c"],"text":"Pick","tooltip":"One of three","type":"dropdown"},' +
                '{"default":4,"max":10.0,"min":0.0,"step":2.0,"text":"Amount","timeout":100.0,"tooltip":"Even only","type":"slider"},' +
                '{"default":true,"text":"On","tooltip":"Flip it","type":"toggle"}],"icon":null,"submit":"Send","title":"Modal","type":"custom_form"}\n'
        );
    });

    it('writes a version 1 modal form from plain arguments, with a slider default cut to an integer', () => {
        expect(
            build('modal', 1, [
                ['textField', 'Name', 'placeholder', 'Steve'],
                ['dropdown', 'Pick', ['a'], 1],
                ['slider', 'Fractional', 0.5, 2.5, 0.25, 1.25]
            ])
        ).toBe(
            '{"content":[{"default":"Steve","placeholder":"placeholder","text":"Name","type":"input"},' +
                '{"default":1,"options":["a"],"text":"Pick","type":"dropdown"},' +
                '{"default":1,"max":2.50,"min":0.50,"step":0.250,"text":"Fractional","timeout":100.0,"type":"slider"}],' +
                '"icon":null,"title":"","type":"custom_form"}\n'
        );
    });

    it('writes an empty dropdown with null options', () => {
        expect(build('modal', 2, [['dropdown', 'd', []]])).toBe(
            '{"content":[{"options":null,"text":"d","type":"dropdown"}],"icon":null,"title":"","type":"custom_form"}\n'
        );
    });

    it('swaps the two buttons of a version 1 message form', () => {
        expect(
            build('message', 1, [
                ['button1', 'Yes'],
                ['button2', 'No']
            ])
        ).toBe('{"button1":"No","button2":"Yes","content":"","title":"","type":"modal"}\n');
        expect(
            build('message', 2, [
                ['button1', 'Yes'],
                ['button2', 'No']
            ])
        ).toBe('{"button1":"Yes","button2":"No","content":"","title":"","type":"modal"}\n');
    });
});

describe('writing a RawMessage as BDS writes it in a form', () => {
    const written = (message: PlainValue): string => writeBdsJsonValue(formText(message, 0));

    it.each<[string, PlainValue, string]>([
        ['translate over text', { text: 'a', translate: 'b' }, '{"rawtext":[{"translate":"b"}]}'],
        ['rawtext over text', { text: 'a', rawtext: [{ text: 'b' }] }, '{"rawtext":[{"text":"b"}]}'],
        ['a nested rawtext', { rawtext: [{ rawtext: [{ text: 'n' }] }] }, '{"rawtext":[{"rawtext":[{"text":"n"}]}]}'],
        [
            'a with of strings',
            { translate: 't', with: ['a', 'b'] },
            '{"rawtext":[{"translate":"t","with":{"rawtext":[{"text":"a"},{"text":"b"}]}}]}'
        ],
        ['an empty with', { translate: 't', with: [] }, '{"rawtext":[{"translate":"t"}]}'],
        [
            'a with of a raw message',
            { translate: 't', with: { rawtext: [{ text: 'y' }] } },
            '{"rawtext":[{"translate":"t","with":{"rawtext":[{"text":"y"}]}}]}'
        ],
        [
            'a score',
            { score: { name: '*', objective: 'obj' } },
            '{"rawtext":[{"score":{"name":"*","objective":"obj"}}]}'
        ],
        ['an empty text', { text: '' }, '{"rawtext":[{"text":""}]}'],
        ['a rawtext holding nothing', { rawtext: [{}] }, '{"rawtext":null}']
    ])('writes %s', (_name, message, json) => {
        expect(written(message)).toBe(json);
    });

    it.each<[string, PlainValue]>([
        ['an empty object', {}],
        ['an empty rawtext', { rawtext: [] }]
    ])('refuses %s with RawMessageError', (_name, message) => {
        let caught: unknown;
        try {
            formText(message, 0);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(ScriptApiError);
        expect(caught).toMatchObject({
            errorClass: 'RawMessageError',
            message: 'Failed to resolve raw message from json: \n{"rawtext":[null]}\n.'
        });
    });

    it('refuses a rawtext of strings with the binding’s variant error', () => {
        expect(() => formText({ rawtext: ['a'] }, 0)).toThrow(
            'Native variant type conversion failed. Function argument [0] expected type: string | RawMessage'
        );
    });
});

describe('reading a response as BDS reads it', () => {
    const action = { kind: 'action', major: 2, json: '' } as const;
    const modal = { kind: 'modal', major: 2, json: '' } as const;
    const message = { kind: 'message', major: 2, json: '' } as const;

    it.each<[string, string, number | undefined]>([
        ['an index', '2', 2],
        ['an index past the last button', '5', 5],
        ['-1, as an unsigned 32-bit number', '-1', 4294967295],
        ['2^32, as an unsigned 32-bit number', '4294967296', 0],
        ['true, as 1', 'true', 1],
        ['an index with whitespace around it', ' 1\n', 1],
        ['a string', '"1"', undefined],
        ['a fraction', '1.7', undefined],
        ['a whole number written with a fraction', '1.0', undefined],
        ['a list', '[0]', undefined],
        ['null', 'null', undefined]
    ])('reads %s for an action form', (_name, json, selection) => {
        expect(readFormResponse(action, json, null)).toEqual(
            selection === undefined ? { settle: 'malformed' } : { settle: 'selection', selection }
        );
    });

    it('reads a boolean for a message form the other way round in version 2', () => {
        expect(readFormResponse(message, 'true', null)).toEqual({ settle: 'selection', selection: 0 });
        expect(readFormResponse(message, 'false', null)).toEqual({ settle: 'selection', selection: 1 });
        expect(readFormResponse({ ...message, major: 1 }, 'true', null)).toEqual({ settle: 'selection', selection: 1 });
        expect(readFormResponse({ ...message, major: 1 }, 'false', null)).toEqual({
            settle: 'selection',
            selection: 0
        });
        expect(readFormResponse(message, '1', null)).toEqual({ settle: 'selection', selection: 1 });
        expect(readFormResponse(message, '"true"', null)).toEqual({ settle: 'malformed' });
    });

    it('reads any flat list for a modal form, with null only in version 2', () => {
        expect(readFormResponse(modal, '[true,"a",3]', null)).toEqual({
            settle: 'values',
            formValues: [true, 'a', 3],
            nullIsUndefined: true
        });
        expect(readFormResponse(modal, '[]', null)).toEqual({
            settle: 'values',
            formValues: [],
            nullIsUndefined: true
        });
        expect(readFormResponse(modal, '[null,null]', null)).toMatchObject({ settle: 'values' });
        expect(readFormResponse({ ...modal, major: 1 }, '[null,null]', null)).toEqual({ settle: 'malformed' });
        expect(readFormResponse(modal, '[[1],{"a":1}]', null)).toEqual({ settle: 'malformed' });
        expect(readFormResponse(modal, '{}', null)).toEqual({ settle: 'malformed' });
    });

    it('lets a cancel reason win over JSON, with any byte but 1 read as UserClosed', () => {
        expect(readFormResponse(action, null, 1)).toEqual({ settle: 'canceled', reason: 'UserBusy' });
        expect(readFormResponse(action, null, 2)).toEqual({ settle: 'canceled', reason: 'UserClosed' });
        expect(readFormResponse(action, '0', 1)).toEqual({ settle: 'canceled', reason: 'UserBusy' });
        expect(readFormResponse(action, null, null)).toEqual({ settle: 'none' });
    });

    it('reads text that is not JSON as malformed, without throwing', () => {
        expect(readFormResponse(modal, '[1', null)).toEqual({ settle: 'malformed' });
        expect(readFormResponse(action, '', null)).toEqual({ settle: 'malformed' });
    });
});
