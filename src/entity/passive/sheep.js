const Entity = require('../entity')
const EntityType = require('../entity-type')

class Sheep extends Entity {
    static MOB_ID = EntityType.Sheep
}
module.exports = Sheep