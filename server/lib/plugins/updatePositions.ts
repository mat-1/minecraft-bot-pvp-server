import { Entity } from "prismarine-entity"

const Vec3 = require('vec3').Vec3
const { performance } = require('perf_hooks')

function conv256(f) {
	let b = Math.floor((f % 360) * 256 / 360)
	if (b < -128) b += 256
	else if (b > 127) b -= 256
	return b
}

function conv(f) {
	let b = f
	if (b > 180) b -= 360
	return b
}

module.exports.player = function (player) {
	player._client.on('look', ({ yaw, pitch, onGround }: any = {}) => setLook(yaw, pitch, onGround))

	// float (degrees) --> byte (1/256 "degrees")
	function setLook(yaw: number, pitch: number, onGround: boolean) {
		player.yaw = conv(yaw)
		player.pitch = conv(pitch)
		player.onGround = onGround

		// player.behavior('look', {
		// 	yaw: yaw,
		// 	pitch: pitch,
		// 	onGround: onGround
		// }, () => {
		// 	const convYaw = conv(yaw)
		// 	const convPitch = conv(pitch)
		// 	if (convYaw === player.yaw && convPitch === player.pitch) return
		// 	player._writeOthersNearby('entity_look', {
		// 		entityId: player.id,
		// 		yaw: convYaw,
		// 		pitch: convPitch,
		// 		onGround: onGround
		// 	})
		// 	player.yaw = convYaw
		// 	player.pitch = convPitch
		// 	player.onGround = onGround
		// 	player._writeOthersNearby('entity_head_rotation', {
		// 		entityId: player.id,
		// 		headYaw: convYaw
		// 	})
		// }, () => {
		// 	player.sendSelfPosition()
		// })
	}

	player._client.on('position', ({ x, y, z, onGround }: any = {}) => {
		player.setPosition((new Vec3(x, y, z)), onGround)
	})

	player._client.on('position_look', ({ x, y, z, onGround, yaw, pitch }: any = {}) => {
		player.setPosition((new Vec3(x, y, z)), onGround)
		setLook(yaw, pitch, onGround)
	})

	player.sendSelfPosition = () => {
		// double position in all versions
		player._client.write('position', {
			x: player.position.x,
			y: player.position.y,
			z: player.position.z,
			yaw: player.yaw,
			pitch: player.pitch,
			flags: 0x00,
			teleportId: 1
		})
	}

	player.teleport = async (position) => {
		player.position = position
		player.sendSelfPosition()
	}

	player.sendAbilities = () => { // FIXME
		// const godmode = player.gameMode === 1 || player.gameMode === 3
		// const canFly = player.gameMode === 1 || player.gameMode === 3
		// const isFlying = !player.onGround && canFly
		// const creativeMode = player.gameMode === 1
		// const f = (+godmode * 8) + (+canFly * 4) + (+isFlying * 2) + (+creativeMode)
		// const walkingSpeed = 0.2 * (1 + (player.effects[1] !== null ? (player.effects[1].amplifier + 1) : 0) * 0.2)
		// const flyingSpeed = 0.1
		// console.log(walkingSpeed, flyingSpeed);
		// player._client.write('abilities', { // XXX
		//   flags: f,
		//   walkingSpeed: walkingSpeed,
		//   flyingSpeed: flyingSpeed
		// });
	}
}

module.exports.entity = function (entity, serv) {
	const hasMoved = () => {
		if (!entity.previousPosition) return true
		return entity.position.x !== entity.previousPosition.x
			|| entity.position.y !== entity.previousPosition.y
			|| entity.position.z !== entity.previousPosition.z
	}
	const hasRotated = () => {
		if (!entity.previousRotation) return true
		return entity.yaw !== entity.previousRotation.yaw
			|| entity.pitch !== entity.previousRotation.pitch
	}

	entity.setPosition = (position, onGround) => {
		// the player is dead, it cannot move
		if (!entity.alive) return

		if (entity.position.distanceTo(position) > 6 && entity.type === 'player') {
			// the player is probably hacking, teleport them back!
			entity.sendSelfPosition()
			return
		}
		// TODO: validate move
		entity.position = position
		if (onGround != undefined)
			entity.onGround = onGround
	}
	function doVoidDamage() {
		if (entity.position.y < 0) {
			entity.takeDamage({ damage: 20 })
		}
	}
	entity.tick = () => {
		doVoidDamage()
		if (entity.trackingTick == undefined) entity.trackingTick = 0
		entity.sendPosition(entity.position, entity.onGround)
	}
	entity.sendPosition = (position, onGround, teleporting = false) => {
		if (typeof position === 'undefined') throw new Error('undef')

		if (entity.trackingTick % 2 == 0 || entity.velocityChanged) {
			// known position is very important because the diff (/delta) send to players is floored hence is not precise enough
			// storing the known position allows to compensate next time a diff is sent
			// without the known position, the error accumulate fast and player position is incorrect from the point of view
			// of other players
			entity.knownPosition = entity.knownPosition === undefined ? entity.position : entity.knownPosition

			const diff = position.minus(entity.knownPosition)

			let maxDelta
			if (serv.supportFeature('fixedPointDelta')) {
				maxDelta = 4
			} else if (serv.supportFeature('fixedPointDelta128')) {
				maxDelta = 8
			}

			const moved = hasMoved()
			const rotated = hasRotated()

			const teleport = diff.abs().x >= maxDelta || diff.abs().y >= maxDelta || diff.abs().z >= maxDelta
			const onGroundChanged = entity.lastOnGround !== onGround
			// const onGroundChanged = false

			const convYaw = conv256(entity.yaw)
			const convPitch = conv256(entity.pitch)

			const convYawChanged = entity.previousConvYaw !== convYaw

			if (teleport || teleporting || onGroundChanged) {
				let entityPosition

				if (serv.supportFeature('fixedPointPosition')) {
					entityPosition = position.scaled(32).floored()
				} else if (serv.supportFeature('doublePosition')) {
					entityPosition = position
				}
				entity._writeOthersNearby('entity_teleport', {
					entityId: entity.id,
					x: entityPosition.x,
					y: entityPosition.y,
					z: entityPosition.z,
					yaw: convYaw,
					pitch: convPitch,
					onGround: onGround
				})

				entity.knownPosition = position
				entity.lastOnGround = onGround
			} else if (moved) {
				let delta
				if (serv.supportFeature('fixedPointDelta')) {
					delta = diff.scaled(32).floored()
					entity.knownPosition = entity.knownPosition.plus(delta.scaled(1 / 32))
				} else if (serv.supportFeature('fixedPointDelta128')) {
					delta = diff.scaled(32).scaled(128).floored()
					entity.knownPosition = entity.knownPosition.plus(delta.scaled(1 / 32 / 128))
				}
				if (rotated) {
					entity._writeOthersNearby('entity_move_look', {
						entityId: entity.id,
						dX: delta.x,
						dY: delta.y,
						dZ: delta.z,
						yaw: convYaw,
						pitch: convPitch,
						onGround: onGround
					})
					entity._writeOthersNearby('entity_head_rotation', {
						entityId: entity.id,
						headYaw: convYaw
					})
				} else {
					entity._writeOthersNearby('rel_entity_move', {
						entityId: entity.id,
						dX: delta.x,
						dY: delta.y,
						dZ: delta.z,
						onGround: onGround
					})
				}
			} else if (rotated) {
				if (convYawChanged)
					entity._writeOthersNearby('entity_look', {
						entityId: entity.id,
						yaw: convYaw,
						pitch: convPitch,
						onGround: onGround
					})
				entity._writeOthersNearby('entity_head_rotation', {
					entityId: entity.id,
					headYaw: convYaw
				})
			}

			if (entity.velocityChanged) {
				// entity._writeOthersNearby('entity_velocity', {
				// 	entityId: entity.id,
				// 	velocityX: entity.velocity.x,
				// 	velocityY: entity.velocity.y,
				// 	velocityZ: entity.velocity.z
				// })
			}

			entity.previousPosition = entity.position
			entity.previousRotation = { pitch: entity.pitch, yaw: entity.yaw }
			entity.previousConvYaw = convYaw
			entity.position = position
			entity.onGround = onGround
			entity.velocityChanged = false
		}
		entity.trackingTick ++
	}

	entity.teleport = (pos) => { // Overwritten in players inject above
		// entity.sendPosition(pos, false, true)
		console.log('entity teleport! FIXME')
	}
}
