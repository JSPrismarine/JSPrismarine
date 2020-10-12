const fs = require('fs');
const fetch = require('node-fetch');

try {
    fs.mkdirSync('./src/block/blocks');
} catch (err) { }

fetch('https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pe/1.0/blocks.json').then((data) => {
    data.json().then((blocks) => {
        blocks.forEach((block) => {
            block.namespace = 'minecraft';
            
            fs.writeFileSync(`./src/block/blocks/${block.name}.ts`, `import Block, { BlockToolType, BlockToolHarvestLevel } from '../block'

export default class ${block.name} extends Block {
    constructor() {
        super({
            name: '${block.namespace}:${block.name}',
            id: ${block.id},
        });
    }

    getHardness() {
        return ${block.hardness};
    }

    getToolType() {
        return BlockToolType.None;
    }

    getToolHarvestLevel() {
        return BlockToolHarvestLevel.None;
    }
};
`, {
                encoding: 'utf8',
                flag: 'w'
            });
        });
    })
})
