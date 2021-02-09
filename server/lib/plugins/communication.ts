import type { Vec3 } from 'vec3'
import type { World } from 'prismarine-world'
import type { MCEntity, MCPlayer, MCServer } from '../..'

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

	serv.getNearby = ({ world, position, radius = 8 * 16 }: Loc): MCPlayer[] => serv.players.filter(player =>
		player.world === world &&
		player.position.distanceTo(position) <= radius
	)

	serv.getNearbyEntities = ({ world, position, radius = 8 * 16 }: Loc): (MCEntity | MCPlayer)[] => Object.keys(serv.entities)
		.map(eId => serv.entities[eId])
		.filter(entity =>
			entity.world === world &&
			entity.position.distanceTo(position) <= radius
		)
}

module.exports.entity = (entity: MCEntity | MCPlayer, serv: MCServer) => {
	entity.getNearby = (): (MCEntity | MCPlayer)[] =>
		serv.getNearbyEntities({
			world: entity.world,
			position: entity.position,
			radius: entity.viewDistance
		})
		.filter((e) => e !== entity)

	entity.getOtherPlayers = (): MCPlayer[] => serv.players.filter((p) => p !== entity)

	entity.getOthers = (): MCEntity[] => serv.entities.filter((e) => e !== entity)

	entity.getNearbyPlayers = (): MCPlayer[] => {
		return (entity.getNearby() as MCPlayer[])
		.filter((e) => e.type === 'player')
	}

	entity.nearbyPlayers = (): MCPlayer[] => {
		return (entity.nearbyEntities as MCPlayer[])
		.filter(e => e.type === 'player')
	}

	entity._writeOthers = (packetName: string, packetFields: any): void => {
		serv._writeArray(packetName, packetFields, entity.getOtherPlayers())
	}

	entity._writeOthersNearby = (packetName: string, packetFields: any): void =>
		serv._writeArray(packetName, packetFields, entity.getNearbyPlayers())

	entity._writeNearby = (packetName: string, packetFields: any): void => {
		const nearbyPlayers: MCPlayer[] = [...entity.getNearbyPlayers(), ...entity.type === 'player' ? [entity as MCPlayer] : []]
		serv._writeArray(packetName, packetFields, nearbyPlayers)
	}
}
