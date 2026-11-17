import { describe, expect, it } from 'vitest';
import type { MetadataSource } from './generate.mts';
import { generateShape } from './generate.mts';
import type { ShapeOverride } from './overrides.mts';

const type = (name: string, extra: object = {}) => ({ is_bind_type: false, is_errorable: false, name, ...extra });
const bind = (name: string) => ({ is_bind_type: true, is_errorable: false, name });
const range = { valid_range: { min: -2147483648, max: 2147483647 } };

const method = (name: string, args: object[] = [], extra: object = {}) => ({
    name,
    arguments: args,
    return_type: type('undefined'),
    call_privilege: [{ name: 'default' }],
    is_constructor: false,
    is_static: false,
    ...extra
});

const callback = (privilege?: string) => ({
    name: 'callback',
    type: type('closure', {
        closure_type: {
            argument_types: [],
            return_type: type('undefined'),
            ...(privilege === undefined ? {} : { call_privilege: { name: privilege } })
        }
    })
});

const api = (classes: object[]) => ({
    name: '@minecraft/server-bindings',
    uuid: 'bindings-uuid',
    module_type: 'script',
    classes,
    interfaces: [],
    enums: [],
    errors: [],
    objects: [],
    constants: [],
    functions: [],
    dependencies: [],
    type_aliases: [],
    peer_dependencies: [{ name: '@minecraft/common', uuid: 'common-uuid', versions: [{ version: '1.0.0' }] }]
});

const stub = (version: string) => ({
    module_type: 'script',
    name: '@minecraft/server',
    uuid: 'server-uuid',
    parentModule: { name: '@minecraft/server-bindings', version },
    peer_dependencies: [],
    wrapper_module: '@minecraft/server-bindings-v1-wrapper'
});

const klass = (name: string, functions: object[], properties: object[] = []) => ({
    name,
    type: bind(name),
    base_types: [],
    functions,
    properties,
    constants: []
});

/** A metadata directory of `@minecraft/server` versions, each a stub and its bindings file. */
const source = (versions: Record<string, object[]>, stubExtra: object = {}): MetadataSource => {
    const files = new Map<string, unknown>();
    for (const [version, classes] of Object.entries(versions)) {
        files.set(`server_${version}.json`, { ...stub(version), ...stubExtra });
        files.set(`server-bindings_${version}.json`, api(classes));
    }
    return { files: [...files.keys()], read: (file) => files.get(file) };
};

const OVERRIDE: ShapeOverride = {
    kind: 'callback-privilege',
    id: 'test-callback',
    module: '@minecraft/server',
    declaration: 'Registry',
    member: 'register',
    argument: 'callback',
    privilege: ['restricted_execution'],
    evidence: 'a test'
};

describe('generateShape', () => {
    it('fails on a key in a public module file that it does not read', () => {
        expect(() => generateShape(source({ '1.0.0': [] }, { unexpected: true }), { overrides: [] })).toThrow(
            'server_1.0.0.json has the key unexpected, which the shape generator does not read'
        );
    });

    it('keeps one segment per stretch of versions with the same value', () => {
        const amount = (max: number) => ({
            name: 'amount',
            type: type('int32', range),
            is_read_only: false,
            is_baked: false,
            get_privilege: [{ name: 'restricted_execution' }],
            set_privilege: [{ name: 'default' }],
            max_value: max
        });
        const { histories } = generateShape(
            source({
                '1.0.0': [klass('Item', [method('a')])],
                '1.1.0': [klass('Item', [method('a')], [amount(64)])],
                '1.2.0': [klass('Item', [], [amount(99)])],
                '2.0.0': [klass('Item', [], [amount(99)])]
            })
        );
        const history = histories.get('@minecraft/server');

        expect(history?.resolves).toEqual({ 1: '1.2.0', 2: '2.0.0' });
        expect(history?.declarations.Item?.segments).toEqual([{ from: '1.0.0', kind: 'class' }]);
        expect(history?.declarations.Item?.members?.a).toEqual([
            { from: '1.0.0', to: '1.1.0', kind: 'method', privilege: ['default'], arguments: [], returns: 'undefined' }
        ]);
        expect(history?.declarations.Item?.members?.amount?.map((segment) => [segment.from, segment.to])).toEqual([
            ['1.1.0', '1.1.0'],
            ['1.2.0', undefined]
        ]);
        expect(history?.versions[0]).toMatchObject({
            bindings: '@minecraft/server-bindings',
            dependencies: { '@minecraft/common': '1.0.0' }
        });
    });

    it('keeps argument details and leaves out the int32 range every number carries', () => {
        const slot = { name: 'slot', type: type('int32', range), details: { min_value: 0, max_value: 26 } };
        const amount = {
            name: 'amount',
            type: type('int32', range),
            details: { default_value: 1, min_value: 1, max_value: 255 }
        };
        const reason = { name: 'reason', type: type('string'), details: { default_value: 'null' } };
        const narrow = { name: 'narrow', type: type('float', { valid_range: { min: 0, max: 1 } }), details: null };
        const { histories } = generateShape(
            source({ '1.0.0': [klass('Item', [method('set', [slot, amount, reason, narrow])])] })
        );
        const set = histories.get('@minecraft/server')?.declarations.Item?.members?.set?.[0];

        expect(set).toMatchObject({
            arguments: [
                { name: 'slot', type: 'int32', min: 0, max: 26 },
                { name: 'amount', type: 'int32', default: 1, min: 1, max: 255 },
                { name: 'reason', type: 'string', default: null },
                { name: 'narrow', type: { kind: 'number', type: 'float', min: 0, max: 1 } }
            ]
        });
    });

    it('leaves out beta versions unless asked for them', () => {
        const metadata = source({ '1.0.0': [klass('Item', [])], '1.1.0-beta': [klass('Item', []), klass('Beta', [])] });

        expect(generateShape(metadata).histories.get('@minecraft/server')?.declarations.Beta).toBeUndefined();
        const withBeta = generateShape(metadata, { includeVersion: () => true }).histories.get('@minecraft/server');
        expect(withBeta?.versions.map((entry) => [entry.version, entry.stability])).toEqual([
            ['1.0.0', 'stable'],
            ['1.1.0-beta', 'beta']
        ]);
        expect(withBeta?.resolves).toEqual({ 1: '1.0.0' });
    });

    it('fails on a metadata key it does not read', () => {
        const metadata = source({ '1.0.0': [klass('Item', [method('a', [], { is_async: true })])] });

        expect(() => generateShape(metadata)).toThrow(/Item\.a has the key is_async/);
    });

    it('applies an override to every version with the gap', () => {
        const registry = klass('Registry', [method('register', [callback()])]);
        const { histories, applied } = generateShape(source({ '1.0.0': [klass('Item', [])], '1.1.0': [registry] }), {
            overrides: [OVERRIDE]
        });
        const register = histories.get('@minecraft/server')?.declarations.Registry?.members?.register?.[0];

        expect(applied.get('test-callback')).toEqual(['1.1.0']);
        expect(register).toMatchObject({
            override: 'test-callback',
            arguments: [{ name: 'callback', type: { kind: 'closure', privilege: ['restricted_execution'] } }]
        });
    });

    it('fails when the metadata records the privilege an override supplies', () => {
        const registry = klass('Registry', [method('register', [callback('restricted_execution')])]);

        expect(() => generateShape(source({ '1.0.0': [registry] }), { overrides: [OVERRIDE] })).toThrow(
            /Override test-callback no longer matches a gap: .* records the privilege restricted_execution/
        );
    });

    it('fails when no version has the member an override names', () => {
        expect(() => generateShape(source({ '1.0.0': [klass('Registry', [])] }), { overrides: [OVERRIDE] })).toThrow(
            /Override test-callback no longer matches a gap: no generated version/
        );
    });
});
