---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

Levels created while the server runs live in `levels.json` beside `config.json`, never in the config. `WorldManager.createLevel` creates one and records it as attached, `attachLevel` attaches a detached one by name or UUID, and `detachLevel` records it as detached and keeps its files. At startup the server loads the config's levels, then the attached ones from `levels.json`. A level the config declares cannot detach while the server runs (`ConfigLevelCannotDetach`), two attached levels cannot share a name (`LevelNameTaken`), and detached levels that share a name are attached by UUID (`AmbiguousLevelName`).
