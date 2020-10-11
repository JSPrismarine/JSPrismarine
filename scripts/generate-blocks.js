const fs = require('fs');

const blocks = [{
    namespace: 'minecraft',
    name: 'air',
    properName: 'Air',
    id: 0
}, {
    namespace: 'minecraft',
    name: 'stone',
    properName: 'Stone',
    id: 1
}, {
    namespace: 'minecraft',
    name: 'grass',
    properName: 'Grass',
    id: 2
}];

try {
    fs.mkdirSync('./src/block/blocks');
} catch (err) { }

blocks.forEach((block) => {
    fs.writeFileSync(`./src/block/blocks/${block.name}.tsx`, `import Block from '../block'

export default class ${block.properName} extends Block {
    constructor() {
        super({
            name: '${block.namespace}:${block.name}',
            id: ${block.id},
        });
    }
};
`, {
    encoding: 'utf8',
    flag: 'w'
});
});
