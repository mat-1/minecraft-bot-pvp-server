import { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import type { Entity } from 'prismarine-entity'

class RaycastIterator {
	initial: Vec3
	pos: Vec3

	stepX: number
	stepY: number
	stepZ: number

	tDeltaX: number
	tDeltaY: number
	tDeltaZ: number

	tMaxX: number
	tMaxY: number
	tMaxZ: number

	maxDistance: number

	constructor(pos, dir, maxDistance, precision=25) {	
		this.initial = pos.clone()
		this.pos = pos

		this.stepX = dir.x / precision
		this.stepY = dir.y / precision
		this.stepZ = dir.z / precision
	
		this.tDeltaX = ((dir.x === 0) ? Number.MAX_VALUE : Math.abs(1 / dir.x)) / precision
		this.tDeltaY = ((dir.y === 0) ? Number.MAX_VALUE : Math.abs(1 / dir.y)) / precision
		this.tDeltaZ = ((dir.z === 0) ? Number.MAX_VALUE : Math.abs(1 / dir.z)) / precision
	
		this.tMaxX = (dir.x === 0) ? Number.MAX_VALUE : Math.abs((this.pos.x + (dir.x > 0 ? 1 : 0) - pos.x) / dir.x)
		this.tMaxY = (dir.y === 0) ? Number.MAX_VALUE : Math.abs((this.pos.y + (dir.y > 0 ? 1 : 0) - pos.y) / dir.y)
		this.tMaxZ = (dir.z === 0) ? Number.MAX_VALUE : Math.abs((this.pos.z + (dir.z > 0 ? 1 : 0) - pos.z) / dir.z)
	
		this.maxDistance = maxDistance
	}
  
	next(): Vec3 | null {
		if (this.pos.distanceTo(this.initial) > this.maxDistance)
			return null

		this.pos.translate(this.stepX, this.stepY, this.stepZ)

		return this.pos
	}
}

export class LimitedBot {
	bot: Bot
	aliveTick: number

	constructor(bot) {
		this.bot = bot
		this.aliveTick = 0
		this.bot.on('physicTick', () => {
			this.aliveTick ++
		})
	}

	setControlState(control: 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'sneak', state: boolean) {
		this.bot.setControlState(control, state)
	}

	async lookAt(point) {
		await this.bot.lookAt(point, true)
	}

	getViewDirection(pitch, yaw) {
		const csPitch = Math.cos(pitch)
		const snPitch = Math.sin(pitch)
		const csYaw = Math.cos(yaw)
		const snYaw = Math.sin(yaw)
		return new Vec3(-snYaw * csPitch, snPitch, -csYaw * csPitch)
	}

	entityAtCursor(maxDistance = 3): null | Entity {
		const { position, height, pitch, yaw } = this.bot.entity

		const eyePosition = position.offset(0, height, 0)
		console.log(eyePosition)
		const viewDirection = this.getViewDirection(pitch, yaw)
		
		// add 1 extra because vanilla reach is technically 4 blocks
		const iter = new RaycastIterator(eyePosition, viewDirection, maxDistance)

		const entities = []
		for (const entityId in this.bot.entities) {
			const entity = this.bot.entities[entityId]
			if (entity.type === null) return null
			const entityData = this.bot.mcdata.entitiesByName[entity.type]
			// @ts-expect-error for some reason they didnt put id in the typings for prismarine-entity
			if (this.bot.entity.id === entity.id) continue
			entities.push({
				BBStart: {
					x: entity.position.x - (entityData.width/2),
					z: entity.position.z - (entityData.width/2),
					y: entity.position.y,
				},
				BBEnd: {
					x: entity.position.x + (entityData.width/2),
					z: entity.position.z + (entityData.width/2),
					y: entity.position.y + entityData.height,
				},
				entity,
			})
		}
		let pos = iter.next()
		while (pos) {
			for (const entity of entities) {
				let posCorrected = pos
				if (
					posCorrected.x >= entity.BBStart.x
					&& posCorrected.y >= entity.BBStart.y
					&& posCorrected.z >= entity.BBStart.z

					&& posCorrected.x <= entity.BBEnd.x
					&& posCorrected.y <= entity.BBEnd.y
					&& posCorrected.z <= entity.BBEnd.z
				) {
					return entity.entity
				}
			}
			pos = iter.next()
		}
		return null
	}

	attack() {
		const target = this.entityAtCursor()
		if (target !== null) {
			this.bot.attack(target)
			this.bot.setControlState('sprint', false)
		} else
			this.bot.swingArm()
	}

	get position(): Vec3 {
		return this.entity.position
	}

	get entity(): Entity {
		return this.bot.entity
	}
}
