import { describe, expect, it } from 'vitest';

import {
    armorReduced,
    bypassesArmor,
    bypassesEnchantments,
    protectionReduced,
    reduceDamage,
    resistanceReduced
} from './Damage';
import { DamageCause } from './DamageCause';

/**
 * The damage formulas.
 *
 * Checked against numbers a player can look up, because that is the only useful definition of
 * correct here: if a full set of iron does not take a ten-point blow down to six, the server is
 * wrong however self-consistent it is.
 * @see https://minecraft.wiki/w/Armor#Damage_protection
 */

/** Full sets, in armour points and toughness. */
const IRON = { points: 15, toughness: 0 };
const DIAMOND = { points: 20, toughness: 8 };

describe('damage reduction', () => {
    describe('armour', () => {
        it('leaves a blow alone when nothing is worn', () => {
            expect(armorReduced(10, 0, 0)).toBe(10);
        });

        it('takes a ten point blow down to six in full iron', () => {
            expect(armorReduced(10, IRON.points, IRON.toughness)).toBeCloseTo(6);
        });

        it('does better in diamond, and better still because of its toughness', () => {
            // Twenty points alone would leave four; the eight toughness is what takes it to three.
            expect(armorReduced(10, 20, 0)).toBeCloseTo(4);
            expect(armorReduced(10, DIAMOND.points, DIAMOND.toughness)).toBeCloseTo(3);
        });

        it('protects less against a harder blow, which is what toughness exists to soften', () => {
            const hardInIron = armorReduced(30, IRON.points, IRON.toughness) / 30;
            const softInIron = armorReduced(4, IRON.points, IRON.toughness) / 4;

            expect(hardInIron).toBeGreaterThan(softInIron);
        });

        it('never protects less than a flat fifth of its points, however hard the blow', () => {
            // Without the floor the softening term goes negative and armour would stop being
            // armour at all somewhere around a twenty point hit.
            expect(armorReduced(100, 20, 0)).toBeCloseTo(84);
        });

        it('cannot take off more than four fifths, so nobody is untouchable', () => {
            // Absurd armour, still a fifth of every blow. There is no build in vanilla that makes
            // armour alone enough, and the twenty point cap is the line that guarantees it.
            expect(armorReduced(10, 40, 40)).toBeCloseTo(2);
        });
    });

    describe('enchantments', () => {
        it('leaves a blow alone with nothing enchanted', () => {
            expect(protectionReduced(10, 0)).toBe(10);
        });

        it('takes off four percent per point of protection', () => {
            expect(protectionReduced(10, 5)).toBeCloseTo(8);
        });

        it('caps at twenty points, so more Protection than that buys nothing', () => {
            expect(protectionReduced(10, 20)).toBeCloseTo(2);
            expect(protectionReduced(10, 40)).toBeCloseTo(2);
        });
    });

    describe('resistance', () => {
        it('takes off a fifth per level', () => {
            expect(resistanceReduced(10, 1)).toBeCloseTo(8);
            expect(resistanceReduced(10, 2)).toBeCloseTo(6);
        });

        it('stops everything at level five', () => {
            expect(resistanceReduced(10, 5)).toBe(0);
        });
    });

    describe('what each cause ignores', () => {
        it('lets drowning and starving through armour', () => {
            expect(bypassesArmor(DamageCause.Drowning)).toBe(true);
            expect(bypassesArmor(DamageCause.Starvation)).toBe(true);
        });

        it('reduces a burn, because armour does help with fire', () => {
            expect(bypassesArmor(DamageCause.Fire)).toBe(false);
            expect(bypassesArmor(DamageCause.Lava)).toBe(false);
        });

        it('ignores armour points on a fall but not the enchantments on them', () => {
            // The whole reason anyone enchants boots. Folding the two lists together made Feather
            // Falling do nothing at all.
            expect(bypassesArmor(DamageCause.Fall)).toBe(true);
            expect(bypassesEnchantments(DamageCause.Fall)).toBe(false);
        });
    });

    describe('the whole pipeline', () => {
        const bare = {
            defensePoints: 0,
            toughness: 0,
            enchantmentProtection: 0,
            resistance: 0,
            bypassesArmor: false,
            bypassesEnchantments: false
        };

        it('applies armour, then enchantments, then resistance', () => {
            // Six after the iron, 4.8 after five points of protection, 3.84 after Resistance I.
            expect(
                reduceDamage(10, { ...bare, defensePoints: IRON.points, enchantmentProtection: 5, resistance: 1 })
            ).toBeCloseTo(3.84);
        });

        it('skips the armour step for the causes that bypass it', () => {
            expect(reduceDamage(10, { ...bare, defensePoints: 20, bypassesArmor: true })).toBeCloseTo(10);
        });

        it('still applies the enchantments when only the armour is bypassed', () => {
            expect(
                reduceDamage(10, { ...bare, defensePoints: 20, enchantmentProtection: 10, bypassesArmor: true })
            ).toBeCloseTo(6);
        });

        it('never returns a negative, whatever the numbers say', () => {
            expect(reduceDamage(10, { ...bare, resistance: 20 })).toBe(0);
            expect(reduceDamage(0, bare)).toBe(0);
        });
    });
});
