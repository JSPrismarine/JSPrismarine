# MOTD

Renders the server list's MOTD from a template: colors, gradients, frames that take turns, and
placeholders such as `{server:online}`. It can also set the second name below the MOTD and the
player counts the list shows. The MOTD shows the same in Bedrock's server list and LAN view,
through the query protocol and on Java Edition's multiplayer screen.

## Installing it

From the server console, install the standard placeholders addon first, since it provides the
`server` and `world` tokens a template uses, then the MOTD addon:

```text
addon install standard-placeholders
addon install motd
```

It needs JSPrismarine <!-- fact:addons.motd.minServer -->0.27.0<!-- /fact --> or newer. The pack
also loads on Bedrock Dedicated Server, where `/motd` says the addon needs JSPrismarine, since only
JSPrismarine lets a script change the server list.

## Templates

A template is a shorthand string, such as `&bMy server &7- {server:online} online`, or a tree in
the shape of Bedrock's rawtext, the format `/tellraw` takes, with placeholders, conditions,
animations and gradients as its nodes. [The standard placeholders addon](../standard-placeholders/README.md)
lists the tokens, and [the JSPrismarine script module](../../docs/guide/jsprismarine-module.md#render-a-template)
the node kinds. `&` color codes in shorthand become `§`.

The server list is for nobody in particular, so a `{player:...}` token stays as written. A `;` in
what a template renders becomes `:`, since the Bedrock ping separates its fields with `;`.

## Commands

Every command is for operators. A template with spaces goes in quotes, as any command argument
does.

| Command                 | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `/motd show`            | Prints what the server list shows now, and the MOTD template.         |
| `/motd set "<template>"` | Sets the MOTD template.                                              |
| `/motd reset`           | Clears it, so the list shows `config.json`'s `motd` again.            |

## The config file

Everything the addon shows lives in `addons/motd.config.json`, beside the addon's folder.
`/motd set` and `/motd reset` write the `motd` field, and an edit in an editor applies without a
reload:

```json
{
    "interval": 20,
    "frameInterval": 60,
    "motd": ["&bMy server &7- {server:online} online", "&eNow with minigames!"],
    "levelName": "Lobby",
    "onlinePlayers": "{server:online}",
    "maxPlayers": 100
}
```

| Field           | What it holds                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `motd`          | The MOTD: a template, or a list of templates the list shows in turn.                                              |
| `levelName`     | The second name, which a Bedrock client shows below the MOTD for a server on its LAN. A template or a list.       |
| `onlinePlayers` | The online count to show: a number, or a template that renders to one, such as `{server:online}`.                 |
| `maxPlayers`    | The player limit to show, the same way. The server still turns players away at `config.json`'s `max-players`.    |
| `interval`      | The ticks between two renders, <!-- fact:addons.motd.interval -->20<!-- /fact --> when left out.                  |
| `frameInterval` | The ticks each template of a list shows for, <!-- fact:addons.motd.frameInterval -->60<!-- /fact --> when left out. |

A field left out leaves the server's own value. A template with an animation renders again when
its frame changes, whatever the interval. A count template that renders to something other than a
whole number keeps the server's own count, and the console says so once. A field of the wrong
shape is left out and named on the console, and the rest of the file still applies.

A client asks for the server list entry when it opens the list and every few seconds after, so a
frame shorter than that may not be seen.

Every change goes when the addon's scripts stop, as on `/reload`, and the list shows the
server's own values again.
