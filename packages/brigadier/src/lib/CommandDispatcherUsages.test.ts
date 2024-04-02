import { assert, expect, describe, beforeEach, it } from 'vitest';
import type Command from './Command';
import CommandDispatcher from './CommandDispatcher';
import { literal } from './builder/LiteralArgumentBuilder';
import StringReader from './StringReader';

describe('CommandDispatcher Usage Test', () => {
    let subject: CommandDispatcher<Object>;
    const source: Object = {};
    const command: Command<Object> = async () => 0;
    beforeEach(() => {
        subject = new CommandDispatcher();
        subject.register(
            literal('a')
                .then(literal('1').then(literal('i').executes(command)).then(literal('ii').executes(command)))
                .then(literal('2').then(literal('i').executes(command)).then(literal('ii').executes(command)))
        );
        subject.register(literal('b').then(literal('1').executes(command)));
        subject.register(literal('c').executes(command));
        subject.register(
            literal('d')
                .requires(() => false)
                .executes(command)
        );
        subject.register(
            literal('e')
                .executes(command)
                .then(
                    literal('1')
                        .executes(command)
                        .then(literal('i').executes(command))
                        .then(literal('ii').executes(command))
                )
        );
        subject.register(
            literal('f')
                .then(
                    literal('1')
                        .then(literal('i').executes(command))
                        .then(
                            literal('ii')
                                .executes(command)
                                .requires(() => false)
                        )
                )
                .then(
                    literal('2')
                        .then(
                            literal('i')
                                .executes(command)
                                .requires(() => false)
                        )
                        .then(literal('ii').executes(command))
                )
        );
        subject.register(
            literal('g')
                .executes(command)
                .then(literal('1').then(literal('i').executes(command)))
        );
        subject.register(
            literal('h')
                .executes(command)
                .then(literal('1').then(literal('i').executes(command)))
                .then(literal('2').then(literal('i').then(literal('ii').executes(command))))
                .then(literal('3').executes(command))
        );
        subject.register(
            literal('i').executes(command).then(literal('1').executes(command)).then(literal('2').executes(command))
        );
        subject.register(literal('j').redirect(subject.getRoot()));
        subject.register(literal('k').redirect(get('h')));
    });

    function get(command: string | StringReader) {
        const t = subject.parse(command, source).getContext().getNodes();
        return t[t.length - 1].getNode();
    }

    it('testAllUsage_noCommands', () => {
        subject = new CommandDispatcher();
        const results = subject.getAllUsage(subject.getRoot(), source, true);
        assert.equal([...results.entries()].length, 0);
    });

    it('testSmartUsage_noCommands', () => {
        subject = new CommandDispatcher();
        const results = subject.getSmartUsage(subject.getRoot(), source);
        assert.equal([...results.entries()].length, 0);
    });

    it('testAllUsage_root', () => {
        const results = subject.getAllUsage(subject.getRoot(), source, true);
        expect(results).to.deep.equal([
            'a 1 i',
            'a 1 ii',
            'a 2 i',
            'a 2 ii',
            'b 1',
            'c',
            'e',
            'e 1',
            'e 1 i',
            'e 1 ii',
            'f 1 i',
            'f 2 ii',
            'g',
            'g 1 i',
            'h',
            'h 1 i',
            'h 2 i ii',
            'h 3',
            'i',
            'i 1',
            'i 2',
            'j ...',
            'k -> h'
        ]);
    });

    it('testSmartUsage_root', () => {
        const results = subject.getSmartUsage(subject.getRoot(), source);
        expect(results).to.deep.equal(
            new Map()
                .set(get('a'), 'a (1|2)')
                .set(get('b'), 'b 1')
                .set(get('c'), 'c')
                .set(get('e'), 'e [1]')
                .set(get('f'), 'f (1|2)')
                .set(get('g'), 'g [1]')
                .set(get('h'), 'h [1|2|3]')
                .set(get('i'), 'i [1|2]')
                .set(get('j'), 'j ...')
                .set(get('k'), 'k -> h')
        );
    });

    it('testSmartUsage_h', () => {
        const results = subject.getSmartUsage(get('h'), source);
        expect(results).to.deep.equal(
            new Map().set(get('h 1'), '[1] i').set(get('h 2'), '[2] i ii').set(get('h 3'), '[3]')
        );
    });

    it('testSmartUsage_offsetH', () => {
        const offsetH = new StringReader('/|/|/h');
        offsetH.setCursor(5);

        const results = subject.getSmartUsage(get(offsetH), source);
        expect(results).to.deep.equal(
            new Map().set(get('h 1'), '[1] i').set(get('h 2'), '[2] i ii').set(get('h 3'), '[3]')
        );
    });
});
