import * as spiralloop from 'spiralloop'
import { Vec3 } from 'vec3'

import * as mcDataInitializer from 'minecraft-data'
import World from 'prismarine-world'
import type { MCServer } from '../..'
import type { Chunk } from 'prismarine-chunk'

module.exports.server = async(serv: MCServer, { version, worldFolder, generation = { name: 'diamond_square', options: { worldHeight: 80 } }}: any = {}) => {
	const mcData = mcDataInitializer(version)

	serv.pregenWorld = (world: World, size: number = 3) => {
		const promises = []
		for (let x = -size; x < size; x++) {
			for (let z = -size; z < size; z++) {
				promises.push(world.getColumn(x, z))
			}
		}
		return Promise.all(promises)
	}

	serv.setBlock = async(world, position, stateId) => {
		serv.players
			.filter(p => p.world === world)
			.forEach(player => player.sendBlock(position, stateId))
		await world.setBlockStateId(position, stateId)
		if (stateId === 0) serv.notifyNeighborsOfStateChange(world, position, serv.tickCount, serv.tickCount, true)
		else serv.updateBlock(world, position, serv.tickCount, serv.tickCount, true)
	}

	if (serv.supportFeature('theFlattening')) {
		serv.setBlockType = async (world: World, position: Vec3, id: number) => {
			serv.setBlock(world, position, mcData.blocks[id].minStateId)
		}
	} else {
		serv.setBlockType = async (world: World, position: Vec3, id: number) => {
			serv.setBlock(world, position, id << 4)
		}
	}

	serv.setBlockAction = async (world: World, position: Vec3, actionId: number, actionParam: number) => {
		const location = new Vec3(position.x, position.y, position.z)
		const blockType = await world.getBlockType(location)

		serv.players
			.filter(p => p.world === world)
			.forEach(player => player.sendBlockAction(position, actionId, actionParam, blockType))
	}

	serv.reloadChunks = (world: World, chunks: Chunk[]) => {
		serv.players
			.filter(player => player.world === world)
			.forEach(oPlayer => {
				chunks
					.filter(({ chunkX, chunkZ }) => oPlayer.loadedChunks[chunkX + ',' + chunkZ] !== undefined)
					.forEach(({ chunkX, chunkZ }) => oPlayer.unloadChunk(chunkX, chunkZ))
				oPlayer.sendRestMap()
			})
	}

	serv.destroyWorld = (world: World) => {
		serv.players
			.filter(player => player.world === world)
			.forEach(player => {
				player.kick('World destroyed')
				delete serv.players[player.id]
			})
		for (const entityId in serv.entities) {
			const entity = serv.entities[entityId]
			if (entity.world === world)
				delete serv.entities[entity.id]
		}
		console.log('World destroyed!')
	}

	/** Returns true if there are no humans in the world, otherwise false **/
	serv.isWorldInactive = (world: World) => {
		for (const playerUUID in serv.players) {
			const player = serv.players[playerUUID]
			if (!player.isNpc && player.world === world)
				return false
		}
		return true
	}

	serv.commands.add({
		base: 'changeworld',
		info: 'to change world',
		usage: '/changeworld overworld|nether',
		onlyPlayer: true,
		op: true,
		action (world, ctx) {
			// if (world === 'nether') ctx.player.changeWorld(serv.netherworld, { dimension: -1 })
			// if (world === 'overworld') ctx.player.changeWorld(serv.overworld, { dimension: 0 })
		}
	})
}

module.exports.player = function (player, serv, settings) {
	const mcData: any = mcDataInitializer(settings.version)
	player.unloadChunk = (chunkX, chunkZ) => {
		delete player.loadedChunks[chunkX + ',' + chunkZ]

		if (serv.supportFeature('unloadChunkByEmptyChunk')) {
			player._client.write('map_chunk', {
				x: chunkX,
				z: chunkZ,
				groundUp: true,
				bitMap: 0x0000,
				chunkData: Buffer.alloc(0)
			})
		} else if (serv.supportFeature('unloadChunkDirect')) {
			player._client.write('unload_chunk', {
				chunkX,
				chunkZ
			})
		}
	}

	player.sendChunk = (chunkX, chunkZ, column) => {
		return player.behavior('sendChunk', {
			x: chunkX,
			z: chunkZ,
			chunk: column
		}, ({ x, z, chunk }) => {
			const blockEntities = chunk.blockEntities ? chunk.blockEntities.map((e) => {
				return {
					type: 'compound',
					name: '',
					value: e
				}
			}) : []


			player._client.write('map_chunk', {
				x: x,
				z: z,
				groundUp: true,
				bitMap: chunk.getMask(),
				biomes: chunk.dumpBiomes(),
				// ignoreOldData: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
				heightmaps: {
					type: 'compound',
					name: '',
					value: {
						MOTION_BLOCKING: { type: 'longArray', value: new Array(36).fill([0, 0]) }
					}
				}, // FIXME: fake heightmap
				chunkData: chunk.dump(),
				blockEntities: serv.supportFeature('updateSignPacket') ? blockEntities.filter(blockEntity => blockEntity.value.id.value !== 'minecraft:sign') : blockEntities
			})
			if (serv.supportFeature('lightSentSeparately')) {
				player._client.write('update_light', {
					chunkX: x,
					chunkZ: z,
					trustEdges: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
					skyLightMask: chunk.skyLightMask,
					blockLightMask: chunk.blockLightMask,
					emptySkyLightMask: 0,
					emptyBlockLightMask: 0,
					data: chunk.dumpLight()
				})
			}

			if (serv.supportFeature('updateSignPacket')) {
				for (const blockEntity of blockEntities) {
					if (blockEntity.value.id.value === 'minecraft:sign') {
						const packetData = {
							location: new Vec3(blockEntity.value.x.value, blockEntity.value.y.value, blockEntity.value.z.value),
							text1: JSON.parse(blockEntity.value.Text1.value).text,
							text2: JSON.parse(blockEntity.value.Text2.value).text,
							text3: JSON.parse(blockEntity.value.Text3.value).text,
							text4: JSON.parse(blockEntity.value.Text4.value).text
						}
						player._client.write(
							'update_sign',
							packetData
						)
					}
				}
			}

			return Promise.resolve()
		})
	}

	function spiral (arr) {
		const t = []
		spiralloop(arr, (x, z) => {
			t.push([x, z])
		})
		return t
	}

	player.sendNearbyChunks = (view: number, group?: boolean) => {
		player.lastPositionChunkUpdated = player.position
		const playerChunkX = Math.floor(player.position.x / 16)
		const playerChunkZ = Math.floor(player.position.z / 16)

		Object.keys(player.loadedChunks)
			.map((key) => key.split(',').map(a => parseInt(a)))
			.filter(([x, z]) => Math.abs(x - playerChunkX) > view || Math.abs(z - playerChunkZ) > view)
			.forEach(([x, z]) => player.unloadChunk(x, z))

		return spiral([view * 2, view * 2])
			.map(t => ({
				chunkX: playerChunkX + t[0] - view,
				chunkZ: playerChunkZ + t[1] - view
			}))
			.filter(({ chunkX, chunkZ }) => {
				const key = chunkX + ',' + chunkZ
				const loaded = player.loadedChunks[key]
				if (!loaded) player.loadedChunks[key] = 1
				return !loaded
			})
			.reduce((acc: any, { chunkX, chunkZ }: { chunkX: number, chunkZ: number }) => {
				const p = acc
					.then(() => player.world.getColumn(chunkX, chunkZ))
					.then((column) => player.sendChunk(chunkX, chunkZ, column))
				return group ? p.then(() => sleep(5)) : p
			}
			, Promise.resolve())
	}

	function sleep (ms: number = 0) {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	player.sendMap = () => {
		console.log('sending map...')
		return player.sendNearbyChunks(Math.min(3, settings['view-distance']))
			.catch((err) => setTimeout(() => { throw err }), 0)
	}

	player.sendRestMap = () => {
		player.sendingChunks = true
		player.sendNearbyChunks(Math.min(player.view, settings['view-distance']), true)
			.then(() => { player.sendingChunks = false })
			.catch((err) => setTimeout(() => { throw err }, 0))
	}

	player.sendSpawnPosition = () => {
		player._client.write('spawn_position', {
			location: player.spawnPoint
		})
	}

	player.changeWorld = async (world, { gamemode, dimension, difficulty, spawnpoint }: { gamemode?: string, dimension?: string, difficulty?: string, spawnpoint?: Vec3 }={}) => {
		player.alive = true
		if (player.world === world) return Promise.resolve()
		player.world = world
		player.loadedChunks = {}
		if (typeof gamemode !== 'undefined') {
			if (gamemode !== player.gameMode) player.prevGameMode = player.gameMode
			player.gameMode = gamemode
		}
		player._client.write('respawn', {
			previousGameMode: player.prevGameMode,
			dimension: mcData.loginPacket.dimension,
			worldName: 'minecraft:overworld',
			difficulty: difficulty || serv.difficulty,
			hashedSeed: serv.hashedSeed,
			gamemode: gamemode || player.gameMode,
			levelType: 'default',
			isDebug: false,
			isFlat: false,
			copyMetadata: true
		})
		if (spawnpoint) player.spawnPoint = spawnpoint
		else await player.findSpawnPoint()
		player.position = player.spawnPoint
		player.sendSpawnPosition()

		await player.sendMap()

		player.emit('change_world')

		player.updateAndSpawn()
		await player.waitPlayerLogin()
		player.sendRestMap()

		// we have to set the position again because sometimes the player decides its not at the position
		player.position = player.spawnPoint
		player.sendSelfPosition()

		console.log('5 player position', player.position)
	}
}
