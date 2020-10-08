const LOGGER = require('../utils/logger');


const Rules =  {
    CommandBlockOutput: 'commandblockoutput',  
    DoDayLightCycle: 'dodaylightcycle',  
    DoEntityDrops: 'doentitydrops',  
    DoFireTick: 'dofiretick',  
    DoMobLoot: 'domobloot',  
    DoMobSpawning: 'domobspawning', 
    DoTileDrops: 'dotiledrops',  
    DoWeatherCycle: 'doweathercycle',  
    DrowingDamage: 'drowningdamage', 
    FallDamage: 'falldamage',
    FireDamage: 'firedamage', 
    KeepInventory: 'keepinventory',  
    MobGriefing: 'mobgriefing',  
    NaturalRegeneration: 'naturalregeneration',  
    PVP: 'pvp',  
    SendCommandFeedback: 'sendcommandfeedback',
    ShowCoordinates: 'showcoordinates',  // bool
    RandomTickSpeed: 'randomtickspeed',
    TNTExplodes: 'tntexplodes'
};

class GameruleManager {

    /** @type {Map<String, any>} */
    #rules = new Map()

    /**
     * Sets a game rule.
     * 
     * @param {string} name 
     * @param {boolean|number} value 
     */
    setGamerule(name, value) {
        this.#rules.set(name, value);
    }

    /**
     * Returns the game rule value by its name.
     * 
     * @param {string} name 
     */
    getGamerule(name) {
        if (!Object.values(Rules).includes(name)) {
            LOGGER.error(`Unknown Gamerule with name ${name}`);
        }
        this.#rules.get(name);
    }

    getGamerules() {
        return this.#rules;
    }

}
module.exports = { GameruleManager, Rules };
