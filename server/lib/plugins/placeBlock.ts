import { Vec3 } from 'vec3'
import type { MCPlayer, MCServer } from '../..'
import type { Item } from 'prismarine-item'
import type { Block } from 'prismarine-block'
import { GAMEMODES } from './players'

const materialToSound = {
  undefined: 'stone',
  rock: 'stone',
  dirt: 'grass',
  plant: 'grass',
  wool: 'cloth',
  web: 'cloth',
  wood: 'wood'
}

export interface PlaceItemData {
	item: Item,
	angle: number,
	direction: number,
	player,
	referencePosition: Vec3,
	placedPosition: Vec3,
	directionVector: Vec3,
	properties: {
	  rotation: number,
	  axis: string,
	  facing: string,
	  half: boolean,
	  waterlogged: boolean
	}
}

export interface InteractBlockData {
	block: Block
	player: MCPlayer
}

module.exports.server = (serv: MCServer, { version }) => {
  const mcData = require('minecraft-data')(version)

  const itemPlaceHandlers = new Map()
  serv.placeItem = (data: PlaceItemData) => {
	const handler = itemPlaceHandlers.get(data.item.type)
	if (!handler) return {} // the item cannot be placed
	return handler ? handler(data) : { id: data.item.type, data: data.item.metadata }
  }

  /**
   * The handler is called when an item of the given type is
   * used to place a block. Arguments are the item, direction
   * and angle
   * It should return the id and data of the block to place
   */
  serv.onItemPlace = (name: string, handler: (data: any) => any, warn: boolean = true) => {
	let item = mcData.itemsByName[name]
	if (!item) item = mcData.blocksByName[name]
	if (itemPlaceHandlers.has(item.id) && warn) {
	  serv.log(`[Warning] onItemPlace handler was registered twice for ${name}`)
	}
	itemPlaceHandlers.set(item.id, handler)
  }

	if (serv.supportFeature('theFlattening')) {
		const parseValue = (value, state) => {
		if (state.type === 'enum') {
			return state.values.indexOf(value)
		}
		if (state.type === 'bool') {
			return value ? 0 : 1
		}
		return parseInt(value, 10)
		}

		serv.setBlockDataProperties = (baseData: number, states: any[], properties: any) => {
			let data = 0
			let offset = 1
			for (let i = states.length - 1; i >= 0; i--) {
				const prop = states[i]
				let value = baseData % prop.num_values
				baseData = Math.floor(baseData / prop.num_values)
				if (properties[prop.name]) {
					value = parseValue(properties[prop.name], prop)
				}
				data += offset * value
				offset *= prop.num_values
			}
			return data
		}

		// Register default handlers for item -> block conversion
		for (const name of Object.keys(mcData.itemsByName)) {
			const block = mcData.blocksByName[name]
			if (block) {
				if (block.states.length > 0) {
					serv.onItemPlace(name, ({ properties }) => {
						const data = block.defaultState - block.minStateId
						return { id: block.id, data: serv.setBlockDataProperties(data, block.states, properties) }
					})
				} else {
					serv.onItemPlace(name, () => {
						return { id: block.id, data: 0 }
					})
				}
			}
		}
	}

	const blockInteractHandler: Map<string, (data: InteractBlockData) => Promise<boolean>> = new Map()
	serv.interactWithBlock = async(data: InteractBlockData) => {
		const handler = blockInteractHandler.get(data.block.name)
		return handler ? await handler(data) : false
	}

  /**
   * The handler is called when a player interact with a block
   * of the given type. Arguments are the block and the player
   * It should return true if the block placement should be
   * cancelled.
   */
  serv.onBlockInteraction = (name: string, handler: (data: InteractBlockData) => Promise<boolean>) => {
		if (blockInteractHandler.has(name)) {
			serv.log(`[Warning] onBlockInteraction handler was registered twice for ${name}`)
		}
		blockInteractHandler.set(name, handler)
  }
}

module.exports.player = function (player, serv, { version }) {
  const mcData = require('minecraft-data')(version)
  const blocks = mcData.blocks

  player._client.on('block_place', async ({ direction, location, cursorY }: { direction?: number, location?: Vec3, cursorY?: number } = {}) => {
	const referencePosition = new Vec3(location.x, location.y, location.z)
	const block = await player.world.getBlock(referencePosition)
	block.position = referencePosition
	if (await serv.interactWithBlock({ block, player })) return

	const heldItem = player.inventory.slots[36 + player.heldItemSlot]
	if (!heldItem || direction === -1 || heldItem.type === -1) return

	const directionVector = directionToVector[direction]
	const placedPosition = referencePosition.plus(directionVector)
	const dx = player.position.x - (placedPosition.x + 0.5)
	const dz = player.position.z - (placedPosition.z + 0.5)
	const angle = Math.atan2(dx, -dz) * 180 / Math.PI + 180 // Convert to [0,360[

	if (serv.supportFeature('blockPlaceHasIntCursor')) cursorY /= 16

	let half = cursorY > 0.5 ? 'top' : 'bottom'
	if (direction === 0) half = 'top'
	else if (direction === 1) half = 'bottom'

	const { id, data } = await serv.placeItem({
	  item: heldItem,
	  angle,
	  direction,
	  player,
	  referencePosition,
	  placedPosition,
	  directionVector,
	  properties: {
		rotation: Math.floor(angle / 22.5 + 0.5) & 0xF,
		axis: directionToAxis[direction],
		facing: directionToFacing[Math.floor(angle / 90 + 0.5) & 0x3],
		half,
		waterlogged: (await player.world.getBlock(placedPosition)).type === mcData.blocksByName.water.id
	  }
	})

	if (!blocks[id]) return

	const sound = 'dig.' + (materialToSound[blocks[id].material] || 'stone')
	serv.playSound(sound, player.world, placedPosition.offset(0.5, 0.5, 0.5), {
	  pitch: 0.8
	})

	if (player.gameMode === GAMEMODES.survival) {
	  heldItem.count--
	  if (heldItem.count === 0) {
		player.inventory.slots[36 + player.heldItemSlot] = null
	  }
	}

	const stateId = serv.supportFeature('theFlattening') ? (blocks[id].minStateId + data) : (id << 4 | data)
	player.setBlock(placedPosition, stateId)
  })
}

const directionToVector = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)]
const directionToAxis = ['y', 'y', 'z', 'z', 'x', 'x']
const directionToFacing = ['north', 'east', 'south', 'west']
