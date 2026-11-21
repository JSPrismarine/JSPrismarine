# Worlds are levels the server manages

Status: proposed

`WorldManager` loads one level per `worlds.<name>` config entry and names a level by its config
key. A level exists only as a config entry, every lookup keys on that name, and the level
`level-name` names stands behind every caller that does not name one. Nothing creates, attaches or
detaches a level while the server runs, unload closes a level with its players still in it, and
moving a player to another level is the `debug changeWorld` command. A world-management addon
such as Multiverse had to invent worlds of its own as void dimensions to work around it.

## Decision

The level is the unit of a world: a save with its own seed, generator, game rules, clock, weather,
spawn, player records and dimensions. A player who changes worlds changes levels. A level's
dimensions stay what packs and datapacks extend a world with.

- **Identity is a UUID**, written into the level's save on its first load. Names are labels that
  can change. Each custom dimension in a save also has a UUID, mapped to the Bedrock dimension
  number the wire protocol and the LevelDB chunk keys need. A number is given once and never reused,
  whether the dimension comes from the config, a datapack, a script or a command.
- **The config declares levels, and only those.** A level in `worlds` is attached at startup. To
  detach it, the owner removes it from the config and restarts the server. A level created while
  the server runs never goes into the config: it lives in `levels.json`, a registry file the server
  owns beside `addons.json`, which records each one as attached or detached. A name is unique among
  the attached levels only.
- **The server owns the lifecycle.** Each level moves through detached, attaching, attached and
  detaching, one operation at a time, and the server announces each change as a kernel event.
  Scripts, commands, the content runtime and the network follow the events. Detaching moves the
  level's players out, stops its scripts, saves it and closes it, and keeps its files so attaching
  it again loads the same save.
- **Moving a player between levels is a server operation.** It carries the player's record from
  one level to the other and gives the client the new level's state: game rules, clock, weather and
  custom dimensions. The two levels' script runtimes see the player leave and arrive.
- **Code names the level it means.** A command source, a block access and a network context carry
  their level. `level-name` names only the level a joining player enters first.
- **Player records are per level.** The config can group levels to share a record, for servers
  such as minigame networks that carry an inventory across levels. Each group names which parts of
  the record it shares, from the inventory to the position, and a part it leaves out stays per
  level.

## Considered options

- **A world as a dimension of one level.** It reuses the teleport between dimensions and one
  script runtime, but every world would share a seed, game rules, a clock, weather and player
  records, which is not what owners expect of a world manager.
- **The config as the record of every level.** A command creating a level would write into a file
  the owner edits by hand, racing their editor and losing their formatting. The save already
  overrides the config for what a level is ("saved stems win"), so the config would still not
  be the record of truth.
