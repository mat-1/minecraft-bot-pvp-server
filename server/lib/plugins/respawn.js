
module.exports.player = function (player, serv, settings) {
  const mcData = require('minecraft-data')(settings.version)

  player._client.on('client_command', (data) => {
    let actionId

    if (serv.supportFeature('respawnIsPayload')) {
      actionId = data.payload
    } else if (serv.supportFeature('respawnIsActionId')) {
      actionId = data.actionId
    }

    // if the player is trying to respawn and they're dead, respawn
    if (actionId === 0 && !player.alive) {
      player.position = player.spawnPoint

      player.behavior('requestRespawn', {}, () => {
        player._client.write('respawn', {
          previousGameMode: player.prevGameMode,
          // dimension: serv.supportFeature('dimensionIsAString') ? serv.dimensionNames[0] : 0,
          dimension: mcData.loginPacket.dimension,
          worldName: 'minecraft:overworld',
          difficulty: serv.difficulty,
          hashedSeed: serv.hashedSeed,
          gamemode: player.gameMode,
          levelType: 'default',
          isDebug: false,
          isFlat: false,
          copyMetadata: false
        })
        player.sendSelfPosition()
        player.updateHealth(20)
        player.nearbyEntities = []
        player.updateAndSpawn()
        player.alive = true
        console.log('player respawned, theyre alive now')
        setTimeout(() => {
          // sometimes the player isnt alive when theyre supposed to be
          player.alive = true
        }, 100)
      })
    }
  })
}
