import Client from '@jsprismarine/client';

const ip = process.argv[2].split(':')[0];
const port = process.argv[2].split(':')[1];

const clients = new Array(5);
for (let i = 0; i < clients.length; i++) {
    clients[i] = new Client();
}

Promise.all(
    clients.map(async (c) => {
        await c.connect(ip, port);
    })
).then(() => {
    console.log('connected');
});
