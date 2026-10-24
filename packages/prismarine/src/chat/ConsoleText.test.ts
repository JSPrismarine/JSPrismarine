import { describe, expect, it } from 'vitest';
import type { CommandExecutor } from '../command/CommandExecutor';
import { DamageCause } from '../entity/DamageCause';
import { DamageSource } from '../entity/DamageSource';
import { deathMessage } from '../entity/DeathMessages';
import type { Entity } from '../entity/Entity';
import { stub } from '../testing/stub.test.helper';
import { Chat, ChatType } from './Chat';
import { consoleTextOf, translateForConsole } from './ConsoleText';

const sender = stub<CommandExecutor>({});

const translation = (message: string, parameters: string[]) =>
    new Chat({ sender, message, parameters, needsTranslation: true, type: ChatType.TRANSLATION });

const entity = (name: string, type: string) => stub<Entity>({ getName: () => name, getType: () => type });

describe('ConsoleText', () => {
    describe('translateForConsole', () => {
        it('renders the join message as English', () => {
            expect(translateForConsole('%multiplayer.player.joined', ['filfat'])).toBe('filfat joined the game');
        });

        it('renders the leave message as English', () => {
            expect(translateForConsole('%multiplayer.player.left', ['filfat'])).toBe('filfat left the game');
        });

        it('fills positional placeholders in order', () => {
            expect(translateForConsole('%death.attack.player', ['Steve', 'Alex'])).toBe('Steve was slain by Alex');
        });

        it('accepts a key without the leading percent', () => {
            expect(translateForConsole('multiplayer.player.joined', ['filfat'])).toBe('filfat joined the game');
        });

        it('shows the key and its parameters when there is no template', () => {
            expect(translateForConsole('%foo.bar', ['a', 'b'])).toBe('foo.bar [a, b]');
        });

        it('shows a bare unknown key when it has no parameters', () => {
            expect(translateForConsole('%foo.bar', [])).toBe('foo.bar');
        });
    });

    describe('consoleTextOf', () => {
        it('translates a translation chat', () => {
            expect(consoleTextOf(translation('%multiplayer.player.joined', ['filfat']))).toBe('filfat joined the game');
        });

        it('passes a plain chat through unchanged, color codes included', () => {
            const chat = new Chat({ sender, message: '§a<filfat>§r hello %s', parameters: ['ignored'] });

            expect(consoleTextOf(chat)).toBe('§a<filfat>§r hello %s');
        });

        it('has English for every death message the server can send', () => {
            const victim = entity('Steve', 'minecraft:player');
            const killers = [null, entity('Alex', 'minecraft:player'), entity('', 'minecraft:zombie')];

            for (const cause of Object.values(DamageCause)) {
                for (const attacker of killers) {
                    const { key, parameters } = deathMessage(victim, new DamageSource({ cause, attacker }));
                    const text = consoleTextOf(translation(key, parameters));

                    expect(text, `${cause} by ${attacker?.getType() ?? 'nobody'}`).not.toMatch(/^death\./);
                    expect(text).toContain('Steve');
                }
            }
        });

        it('names the mob that did the killing', () => {
            const { key, parameters } = deathMessage(
                entity('Steve', 'minecraft:player'),
                DamageSource.entity(entity('', 'minecraft:zombie_villager'))
            );

            expect(consoleTextOf(translation(key, parameters))).toBe('Steve was slain by Zombie Villager');
        });
    });
});
