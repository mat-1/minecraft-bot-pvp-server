import * as Entity from 'prismarine-entity/index'
import plugins from '../plugins'
import * as UserError from '../user_error'
import * as UUID from 'uuid-1345'
import { Vec3 } from 'vec3'
import { MCEntity } from '../..'

function conv256(f) {
	let b = Math.floor((f % 360) * 256 / 360)
	if (b < -128) b += 256
	else if (b > 127) b -= 256
	return b
}

module.exports.server = function (serv, options) {
	const version = options.version

	const mobsById = require('minecraft-data')(version).mobs
	const objectsById = require('minecraft-data')(version).objects

	serv.initEntity = (type, entityType, world, position) => {
		serv.entityMaxId++
		// @ts-expect-error
		const entity = new Entity(serv.entityMaxId)

		Object.keys(plugins)
			.filter(pluginName => plugins[pluginName].entity !== undefined)
			.forEach(pluginName => plugins[pluginName].entity(entity, serv, options))

		entity.initEntity(type, entityType, world, position)

		serv.emit('newEntity', entity)

		return entity
	}

	serv.spawnObject = (type, world, position, { pitch = 0, yaw = 0, velocity = new Vec3(0, 0, 0), data = 1, itemId, itemDamage = 0, itemCount = 1, pickupTime = undefined, deathTime = undefined }) => {
		const object = serv.initEntity('object', type, world, position)
		object.uuid = UUID.v4()
		// TODO: don't use objectsById, it doesn't exist
		object.name = objectsById[type] === undefined ? 'unknown' : objectsById[type].name
		object.data = data
		object.velocity = velocity
		object.pitch = pitch
		object.yaw = yaw
		object.gravity = new Vec3(0, -20, 0)
		object.terminalvelocity = new Vec3(27, 27, 27)
		object.friction = new Vec3(15, 0, 15)
		object.size = new Vec3(0.25, 0.25, 0.25) // Hardcoded, will be dependent on type!
		object.deathTime = deathTime
		object.pickupTime = pickupTime
		object.itemId = itemId
		object.itemDamage = itemDamage
		object.itemCount = itemCount

		object.updateAndSpawn()
	}

	serv.spawnMob = (type, world, position, { pitch = 0, yaw = 0, headPitch = 0, velocity = new Vec3(0, 0, 0), metadata = [] } = {}) => {
		const mob = serv.initEntity('mob', type, world, position)
		mob.uuid = UUID.v4()
		mob.name = mobsById[type].name
		mob.velocity = velocity
		mob.pitch = pitch
		mob.headPitch = headPitch
		mob.yaw = yaw
		mob.gravity = new Vec3(0, -20, 0)
		mob.terminalvelocity = new Vec3(27, 27, 27)
		mob.friction = new Vec3(15, 0, 15)
		mob.size = new Vec3(0.75, 1.75, 0.75)
		mob.health = 20
		mob.metadata = metadata

		mob.updateAndSpawn()
		return mob
	}

	serv.destroyEntity = (entity: MCEntity) => {
		entity._writeOthersNearby('entity_destroy', {
			entityIds: [entity.id]
		})
		delete serv.entities[entity.id]
		entity.removeAllListeners()
	}

	const entitiesByName = require('minecraft-data')(version).entitiesByName

	serv.commands.add({
		base: 'summon',
		info: 'Summon an entity',
		usage: '/summon <entity_name>',
		onlyPlayer: true,
		op: true,
		action (name, ctx) {
			const entity = entitiesByName[name]
			if (!entity) {
				return 'No entity named ' + name
			}
			if (entity.type === 'mob') {
				serv.spawnMob(entity.id, ctx.player.world, ctx.player.position, {
					velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
				})
			} else if (entity.type === 'object') {
				serv.spawnObject(entity.id, ctx.player.world, ctx.player.position, {
					velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
				})
			}
		}
	})

	serv.commands.add({
		base: 'summonMany',
		info: 'Summon many entities',
		usage: '/summonMany <number> <entity_name>',
		onlyPlayer: true,
		op: true,
		parse (str) {
			const args = str.split(' ')
			if (args.length !== 2) { return false }
			return { number: args[0], name: args[1] }
		},
		action ({ number, name }, ctx) {
			const entity = entitiesByName[name]
			if (!entity) {
				return 'No entity named ' + name
			}
			const s = Math.floor(Math.sqrt(number))
			for (let i = 0; i < number; i++) {
				if (entity.type === 'mob') {
					serv.spawnMob(entity.id, ctx.player.world, ctx.player.position.offset(Math.floor(i / s * 10), 0, i % s * 10), {
						velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
					})
				} else if (entity.type === 'object') {
					serv.spawnObject(entity.id, ctx.player.world, ctx.player.position.offset(Math.floor(i / s * 10), 0, i % s * 10), {
						velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
					})
				}
			}
		}
	})

	serv.commands.add({
		base: 'pile',
		info: 'make a pile of entities',
		usage: '/pile <entities types>',
		onlyPlayer: true,
		op: true,
		parse (str) {
			const args = str.split(' ')
			if (args.length === 0) { return false }
			return args
				.map(name => entitiesByName[name])
				.filter(entity => !!entity)
		},
		action (entityTypes, ctx) {
			entityTypes.map(entity => {
				if (entity.type === 'mob') {
					return serv.spawnMob(entity.id, ctx.player.world, ctx.player.position, {
						velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
					})
				} else if (entity.type === 'object') {
					return serv.spawnObject(entity.id, ctx.player.world, ctx.player.position, {
						velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
					})
				} else {
					return Promise.resolve()
				}
			})
				.reduce((prec, entity) => {
					if (prec !== null) { prec.attach(entity) }
					return entity
				}, null)
		}
	})

	serv.commands.add({
		base: 'attach',
		info: 'attach an entity on an other entity',
		usage: '/attach <carrier> <attached>',
		op: true,
		parse (str, ctx) {
			const args = str.split(' ')
			if (args.length !== 2) { return false }

			const carrier = ctx.player ? ctx.player.selectorString(args[0]) : serv.selectorString(args[0])
			if (carrier.length === 0) throw new UserError('one carrier')
			const attached = ctx.player ? ctx.player.selectorString(args[1]) : serv.selectorString(args[1])
			if (attached.length === 0) throw new UserError('one attached')

			return { carrier: carrier[0], attached: attached[0] }
		},
		action ({ carrier, attached }) {
			carrier.attach(attached)
		}
	})
}

module.exports.player = function (player, serv, options) {
	const version = options.version
	const Item = require('prismarine-item')(version)

	player.spawnEntity = (entity) => {
		const spawnPacket = entity.getSpawnPacket()
		// console.log('player spawnEntity', entity.username, spawnPacket)
		player._client.write(entity.spawnPacketName, spawnPacket)
		if (serv.supportFeature('entityMetadataSentSeparately')) {
			entity.sendMetadata(entity.metadata)
		}
		if (typeof entity.itemId !== 'undefined') {
			entity.sendMetadata({
				item: {
					present: true,
					itemId: entity.itemId,
					itemCount: entity.itemCount
				}
			})
		}
		if (serv.supportFeature('allEntityEquipmentInOne')) {
			const equipments = []
			entity.equipment.forEach((equipment, slot) => {
				if (equipment !== undefined) {
					equipments.push({
						slot: slot,
						item: Item.toNotch(equipment)
					})
				}
			})
			if (equipments.length > 0) {
				player._client.write('entity_equipment', {
					entityId: entity.id,
					equipments: equipments
				})
			}
		} else {
			entity.equipment.forEach((equipment, slot) => {
				if (equipment !== undefined) {
					player._client.write('entity_equipment', {
						entityId: entity.id,
						slot: slot,
						item: Item.toNotch(equipment)
					})
				}
			}
			)
		}
	}
}

module.exports.entity = function (entity, serv) {
	entity.initEntity = (type, entityType, world, position) => {
		entity.type = type
		entity.spawnPacketName = ''
		entity.entityType = entityType
		entity.world = world
		entity.position = position
		entity.lastPositionPlayersUpdated = entity.position.clone()
		entity.nearbyEntities = []
		entity.viewDistance = 150
		entity.velocityChanged = true
		entity.score = {}

		entity.bornTime = Date.now()
		serv.entities[entity.id] = entity

		if (entity.type === 'player') entity.spawnPacketName = 'named_entity_spawn'
		else if (entity.type === 'object') entity.spawnPacketName = 'spawn_entity'
		else if (entity.type === 'mob') entity.spawnPacketName = 'spawn_entity_living'
	}

	entity.getSpawnPacket = () => {
		let scaledVelocity = entity.velocity.scaled(8000 / 20) // from fixed-position/second to unit => 1/8000 blocks per tick
		if (serv.supportFeature('fixedPointPosition')) {
			scaledVelocity = scaledVelocity.scaled(1 / 32)
		}
		scaledVelocity = scaledVelocity.floored()

		let entityPosition
		if (serv.supportFeature('fixedPointPosition')) {
			entityPosition = entity.position.scaled(32).floored()
		} else if (serv.supportFeature('doublePosition')) {
			entityPosition = entity.position
		}

		if (entity.type === 'player') {
			return {
				entityId: entity.id,
				playerUUID: entity.uuid,
				x: entityPosition.x,
				y: entityPosition.y,
				z: entityPosition.z,
				yaw: conv256(entity.yaw),
				pitch: conv256(entity.pitch),
				currentItem: 0,
				metadata: entity.createMetadataPacket()
			}
		} else if (entity.type === 'object') {
			return {
				entityId: entity.id,
				objectUUID: entity.uuid,
				type: entity.entityType,
				x: entityPosition.x,
				y: entityPosition.y,
				z: entityPosition.z,
				pitch: conv256(entity.pitch),
				yaw: conv256(entity.yaw),
				objectData: {
					intField: entity.data,
					velocityX: scaledVelocity.x,
					velocityY: scaledVelocity.y,
					velocityZ: scaledVelocity.z
				}
			}
		} else if (entity.type === 'mob') {
			return {
				entityId: entity.id,
				entityUUID: entity.uuid,
				type: entity.entityType,
				x: entityPosition.x,
				y: entityPosition.y,
				z: entityPosition.z,
				yaw: conv256(entity.yaw),
				pitch: conv256(entity.pitch),
				headPitch: conv256(entity.headPitch),
				velocityX: scaledVelocity.x,
				velocityY: scaledVelocity.y,
				velocityZ: scaledVelocity.z,
				metadata: entity.createMetadataPacket()
			}
		}
	}

	entity.updateAndSpawn = (recursive=true) => {
		// (this will call named_entity_spawn)
		entity.alive = true
		const updatedEntities = entity.getNearby()
		const entitiesToAdd = updatedEntities.filter(e => !entity.nearbyEntities.includes(e))
		const entitiesToRemove = entity.nearbyEntities.filter(e => !updatedEntities.includes(e))
		if (entity.type === 'player') {
			entity.despawnEntities(entitiesToRemove)
			entitiesToAdd.forEach(entity.spawnEntity)
		}
		entity.lastPositionPlayersUpdated = entity.position.clone()

		const playersToAdd = entitiesToAdd.filter(e => e.type === 'player' && e.spawned)
		const playersToRemove = entitiesToRemove.filter(e => e.type === 'player' && e.spawned)

		if (recursive) {
			playersToRemove.forEach(p => p.despawnEntities([entity]))
			playersToRemove.forEach(p => p.updateAndSpawn(false))
			playersToAdd.forEach(p => p.spawnEntity(entity))
			playersToAdd.forEach(p => p.updateAndSpawn(false))
		}

		entity.nearbyEntities = updatedEntities
	}

	entity.on('move', () => {
		if (entity.position.distanceTo(entity.lastPositionPlayersUpdated) > 2) { entity.updateAndSpawn() }
	})

	entity.destroy = () => {
		serv.destroyEntity(entity)
	}

	entity.attach = (attachedEntity, leash = false) => {
		if (serv.supportFeature('attachStackEntity') || (serv.supportFeature('setPassengerStackEntity') && leash)) {
			const p = {
				entityId: attachedEntity.id,
				vehicleId: entity.id,
				leash: leash
			}
			if (entity.type === 'player') { entity._client.write('attach_entity', p) }
			entity._writeOthersNearby('attach_entity', p)
		}
		if (serv.supportFeature('setPassengerStackEntity')) {
			const p = {
				entityId: entity.id,
				passengers: [attachedEntity.id]
			}
			if (entity.type === 'player') { entity._client.write('set_passengers', p) }
			entity._writeOthersNearby('set_passengers', p)
		}
	}
}
