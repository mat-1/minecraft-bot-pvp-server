import type { Vec3 } from 'vec3'
import type { World } from 'prismarine-world'
import type { MCServer } from '../..'

export interface Loc {
  world: World,
  position: Vec3,
  radius: number
}

module.exports.server = function (serv: MCServer) {
  serv._writeAll = (packetName: string, packetFields: any) =>
    serv.players.forEach((player) => player._client.write(packetName, packetFields))

  serv._writeArray = (packetName: string, packetFields: any, players: any[]) =>
    players.forEach((player) => player._client.write(packetName, packetFields))

  serv._writeNearby = (packetName: string, packetFields: any, loc: Loc) =>
    serv._writeArray(packetName, packetFields, serv.getNearby(loc))

  serv.getNearby = ({ world, position, radius = 8 * 16 }: Loc): any[] => serv.players.filter(player =>
    player.world === world &&
    player.position.distanceTo(position) <= radius
  )

  serv.getNearbyEntities = ({ world, position, radius = 8 * 16 }: Loc) => Object.keys(serv.entities)
    .map(eId => serv.entities[eId])
    .filter(entity =>
      entity.world === world &&
      entity.position.distanceTo(position) <= radius
    )
}

module.exports.entity = function (entity, serv) {
  entity.getNearby = () => serv
    .getNearbyEntities({
      world: entity.world,
      position: entity.position,
      radius: entity.viewDistance
    })
    .filter((e) => e !== entity)

  entity.getOtherPlayers = () => serv.players.filter((p) => p !== entity)

  entity.getOthers = () => serv.entities.filter((e) => e !== entity)

  entity.getNearbyPlayers = (radius = entity.viewDistance) => entity.getNearby()
    .filter((e) => e.type === 'player')

  entity.nearbyPlayers = (radius = entity.viewDistance) => entity.nearbyEntities
    .filter(e => e.type === 'player')

  entity._writeOthers = (packetName, packetFields) => {
    serv._writeArray(packetName, packetFields, entity.getOtherPlayers())
  }

  entity._writeOthersNearby = (packetName, packetFields) =>
    serv._writeArray(packetName, packetFields, entity.getNearbyPlayers())

  entity._writeNearby = (packetName, packetFields) =>
    serv._writeArray(packetName, packetFields, entity.getNearbyPlayers().concat(entity.type === 'player' ? [entity] : []))
}
