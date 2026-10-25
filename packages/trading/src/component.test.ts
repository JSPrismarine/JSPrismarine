import { describe, expect, it } from 'vitest';

import { parseEconomyTradeTable, parseTradeTableComponent } from './component';

describe('`minecraft:economy_trade_table`', () => {
    it('reads the body every vanilla villager profession writes', () => {
        const settings = parseEconomyTradeTable({
            table: 'trading/economy_trades/farmer_trades.json',
            display_name: 'entity.villager.farmer',
            new_screen: true,
            persist_trades: true,
            cured_discount: [-25, -20],
            max_cured_discount: [-25, -20]
        });

        expect(settings.table).toBe('trading/economy_trades/farmer_trades.json');
        expect(settings.displayName).toBe('entity.villager.farmer');
        expect(settings.newScreen).toBe(true);
        expect(settings.persistTrades).toBe(true);
        expect(settings.curedDiscount).toEqual({ min: -25, max: -20 });
        expect(settings.maxCuredDiscount).toEqual({ min: -25, max: -20 });
    });

    it('reads a range written as `{min, max}` as well as the two-member array vanilla writes', () => {
        expect(parseEconomyTradeTable({ cured_discount: { min: -9, max: -3 } }).curedDiscount).toEqual({
            min: -9,
            max: -3
        });
    });

    it('fills in the documented defaults for the empty body the villager also writes', () => {
        const settings = parseEconomyTradeTable({});

        expect(settings.curedDiscount).toEqual({ min: -25, max: -20 });
        expect(settings.nearbyCuredDiscount).toBe(-20);
        expect(settings.maxNearbyCuredDiscount).toBe(-200);
        expect(settings.heroDemandDiscount).toBe(-4);
        expect(settings.useLegacyPriceFormula).toBe(false);
        expect(settings.showTradeScreen).toBe(true);
    });
});

describe('the legacy `minecraft:trade_table`', () => {
    it('reads the body the legacy villager writes', () => {
        const settings = parseTradeTableComponent({
            table: 'trading/farmer_trades.json',
            display_name: 'entity.villager.farmer',
            convert_trades_economy: true
        });

        expect(settings.table).toBe('trading/farmer_trades.json');
        expect(settings.convertTradesEconomy).toBe(true);
    });
});
