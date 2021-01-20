import { Vec3 } from 'vec3'
import * as UserError from '../user_error'
import * as colors from 'colors'


module.exports.player = (player, serv) => {
	player.updateHealth = (health) => {
		player.health = health
		player._client.write('update_health', {
			food: player.food,
			foodSaturation: 0.0,
			health: player.health
		})
	}

	function attackEntity(entityId: number) {
		const attackedEntity = serv.entities[entityId]
		if (!attackedEntity || (attackedEntity.gameMode !== 0 && attackedEntity.type === 'player')) return
		// for some reason the yaw given to us is wrong, so it can be corrected by doing this
		const actualYaw: number = (player.yaw / 128) * 180
		console.log(player.yaw, actualYaw)
		const velocity = attackedEntity.calculateKnockback(.5, Math.sin(actualYaw * Math.PI/180), -Math.cos(actualYaw * Math.PI/180)).scaled(16)
		console.log(velocity)
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

module.exports.entity = (entity, serv) => {
	entity.calculateKnockback = ({ multiplier, x, z }: { multiplier: number, x: number, z: number }): Vec3 => {
		// if the knockback multiplier is 0, then return 0 knockback
		if (multiplier <= 0) return new Vec3(0, 0, 0)
		const originalVelocity: Vec3 = entity.velocity
		const normalizedVelocity: Vec3 = new Vec3(x, 0.0, z).normalize().scaled(multiplier)
		return new Vec3(originalVelocity.x / 2.0 - normalizedVelocity.x, entity.onGround ? Math.min(0.4, originalVelocity.y / 2.0 + multiplier) : originalVelocity.y, originalVelocity.z / 2.0 - normalizedVelocity.z)
	}
	

	entity.takeDamage = ({ sound = 'game.player.hurt', damage = 1, velocity = new Vec3(0, 0, 0), maxVelocity = new Vec3(4, 4, 4), animation = true }) => {
		// entity.updateHealth(entity.health - damage)
		serv.playSound(sound, entity.world, entity.position)

		entity.sendVelocity(velocity, maxVelocity)

		if (entity.health <= 0) {
			if (animation) {
				entity._writeOthers('entity_status', {
					entityId: entity.id,
					entityStatus: 3
				})
			}
			if (entity.type !== 'player') { delete serv.entities[entity.id] }
		} else if (animation) {
			entity._writeOthers('animation', {
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
