---
'@jsprismarine/errors': patch
'@jsprismarine/prismarine': patch
---

Refuse a world whose `experiments` list names an experiment the server does not implement, such as a typo of `gametest`, with an error that lists the ones it does. A `config.json` read without its schema used to start the world with the experiment off and say nothing.
