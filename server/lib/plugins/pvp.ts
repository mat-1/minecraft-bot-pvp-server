import * as UserError from '../user_error'
import { GAMEMODES } from './players'
import * as colors from 'colors'
import type { MCServer } from '../..'
import { Vec3 } from 'vec3'


module.exports.player = (player, serv: MCServer) => {
	player.updateHealth = (health) => {
		player.health = health
		player._client.write('update_health', {
			food: player.food,
			foodSaturation: 0.0,
			health: player.health
		})

		// This is required for the death animation to happen!
		// Although, it can probably be changed to only send if the health is 0 so the opponent cant use hacks to see their health
		player.setAndUpdateMetadata({
			health: health
		})
	}

	function attackEntity(entityId: number) {
		if (!player.alive) return console.log('dead entity is trying to attack!') // the player is dead so it can't attack
		const attackedEntity = serv.entities[entityId]
		if (!attackedEntity || (![GAMEMODES.survival, GAMEMODES.adventure].includes(attackedEntity.gameMode) && attackedEntity.type === 'player')) return

		let multiplier = 1

		if (player.metadata.sprinting) multiplier ++
		
		const velocity = attackedEntity.calculateKnockback({multiplier: multiplier * .5, x: Math.sin(player.yaw * Math.PI/180), z: -Math.cos(player.yaw * Math.PI/180)}).scaled(16)
		player.behavior('attack', {
			attackedEntity: attackedEntity,
			velocity: velocity
			// velocity: attackedEntity.position.minus(player.position).plus(new Vec3(0, 0.5, 0)).scaled(5)
		}, (o) => o.attackedEntity.takeDamage(o))
	}

	player._client.on('use_entity', ({ mouse, target }: { mouse: number, target: any }) => {
		if (!serv.entities[target]) {
			let dragon = target - 1
			while (dragon >= target - 7 && !serv.entities[dragon]) {
				dragon--
			}
			if (serv.entities[dragon] && serv.entities[dragon].entityType === 63) { target = dragon }
		}
		if (mouse === 1) { attackEntity(target) }
	})
}

module.exports.entity = (entity, serv: MCServer) => {
	entity.calculateKnockback = ({ multiplier, x, z }: { multiplier: number, x: number, z: number }): Vec3 => {
		// if the knockback multiplier is 0, then return 0 knockback
		if (multiplier <= 0) return new Vec3(0, 0, 0)
		const originalVelocity: Vec3 = entity.velocity
		const normalizedVelocity: Vec3 = new Vec3(x, 0.0, z).normalize().scaled(multiplier)
		entity.velocityChanged = true

		// vanilla
		return new Vec3(originalVelocity.x / 2.0 - normalizedVelocity.x, entity.onGround ? Math.min(0.4, originalVelocity.y / 2.0 + multiplier) : originalVelocity.y, originalVelocity.z / 2.0 - normalizedVelocity.z)

		// combo
		// return new Vec3(originalVelocity.x / 2.0 - normalizedVelocity.x, Math.min(0.4, originalVelocity.y / 2.0 + multiplier), originalVelocity.z / 2.0 - normalizedVelocity.z)

		// ultra knockback
		// return new Vec3((originalVelocity.x / 2.0 - normalizedVelocity.x) * 10, Math.min(0.4, originalVelocity.y / 2.0 + multiplier) * 2, (originalVelocity.z / 2.0 - normalizedVelocity.z) * 10)
	}
	

	entity.takeDamage = ({ sound = 'entity.player.hurt', damage = 1, velocity = new Vec3(0, 0, 0), maxVelocity = new Vec3(4, 4, 4) }) => {
		if (!entity.alive) return // cant kill someone thats already dead
		entity.updateHealth(entity.health - damage)

		// this plays the hurt sound

		entity.sendVelocity(velocity, maxVelocity)

		entity._writeNearby('entity_status', {
			entityId: entity.id,
			entityStatus: 2
		})

		if (entity.health <= 0) {
			entity.alive = false
			entity._writeNearby('entity_status', {
				entityId: entity.id,
				entityStatus: 3
			})
			setTimeout(() => {
				// if the send the entity_destroy immediately then theres no animation
				entity._writeOthersNearby('entity_destroy', {
					entityIds: [entity.id]
				})
			}, 1000)
			entity.emit('death')
			if (entity.type !== 'player') { delete serv.entities[entity.id] }
		} else {
			entity._writeNearby('animation', {
				entityId: entity.id,
				animation: 1
			})
		}
	}

	if (entity.type !== 'player') {
		entity.updateHealth = (health) => {
			entity.health = health
		}
	}
}

module.exports.server = function (serv) {
	serv.commands.add({
		base: 'kill',
		info: 'Kill entities',
		usage: '/kill <selector>|<player>',
		parse (str) {
			return str || false
		},
		action (sel, ctx) {
			if (sel !== '') {
				if (serv.getPlayer(sel) !== null) {
					serv.getPlayer(sel).takeDamage({ damage: 20 })
					serv.info(`Killed ${colors.bold(sel)}`)
				} else {
					const arr = serv.selectorString(sel)
					if (arr.length === 0) throw new UserError('Could not find player')
					arr.forEach(entity => {
						entity.takeDamage({ damage: 20 })
						serv.info(`Killed ${colors.bold(entity.type === 'player' ? entity.username : entity.name)}`)
					})
				}
			} else {
				if (ctx.player) ctx.player.takeDamage({ damage: 20 })
				else serv.err('Can\'t kill console')
			}
		}
	})
}
