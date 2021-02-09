import { Vec3 } from 'vec3'

import * as crypto from 'crypto'
import plugins from '../plugins'
import * as playerDat from '../playerDat'
import * as convertInventorySlotId from '../convertInventorySlotId'

module.exports.server = function (serv, options) {
	serv._server.on('connection', client =>
		client.on('error', error => serv.emit('clientError', client, error)))

	serv._server.on('login', async (client, { isNpc, world, position }: any = {}) => {
		if (!isNpc && client.socket.listeners('end').length === 0) return // TODO: should be fixed properly in nmp instead
		try {
			const player = serv.initEntity('player', null, world || serv.hub, position || new Vec3(0, 0, 0))
			player._client = client
			player.isNpc = isNpc
			if (position) player.forceSpawnPoint = position

			player.profileProperties = player._client.profile ? player._client.profile.properties : []

			Object.keys(plugins)
				.filter(pluginName => plugins[pluginName].player !== undefined)
				.forEach(pluginName => plugins[pluginName].player(player, serv, options))

			serv.emit('newPlayer', player)
			player.emit('asap')
			await player.login()
		} catch (err) {
			setTimeout(() => { throw err }, 0)
		}
	})

	serv.hashedSeed = [0, 0]
	serv.on('seed', (seed) => {
		const seedBuf = Buffer.allocUnsafe(8)
		seedBuf.writeBigInt64LE(BigInt(seed))
		const seedHash = crypto.createHash('sha256').update(seedBuf).digest().subarray(0, 8).readBigInt64LE()
		serv.hashedSeed = [Number(BigInt.asIntN(64, seedHash) < 0 ? -(BigInt.asUintN(32, (-seedHash) >> 32n) + 1n) : seedHash >> 32n), Number(BigInt.asIntN(32, seedHash & (2n ** 32n - 1n)))] // convert BigInt to mcpc long
	})
}

module.exports.player = async function (player, serv, settings) {
	const Item = require('prismarine-item')(settings.version)
	const mcData = require('minecraft-data')(settings.version)

	let playerData

	async function addPlayer() {
		player.type = 'player'
		player.op = settings['everybody-op'] // REMOVE THIS WHEN OUT OF TESTING
		player.username = player._client.username
		player.uuid = player._client.uuid

		await player.findSpawnPoint()

		playerData = await playerDat.read(player.uuid, player.spawnPoint, settings.worldFolder)
		Object.keys(playerData.player).forEach(k => { player[k] = playerData.player[k] })

		serv.players.push(player)
		serv.uuidToPlayer[player.uuid] = player
		player.loadedChunks = {}
	}

	function updateInventory () {
		playerData.inventory.forEach((item) => {
			let theItem
			const itemName = item.id.value.slice(10)
			if (mcData.itemsByName[itemName]) {
				theItem = mcData.itemsByName[itemName]
			} else {
				theItem = mcData.blocksByName[itemName]
			}
			const newItem = new Item(theItem.id, item.Count.value, item.Damage.value)
			const slot = convertInventorySlotId.fromNBT(item.Slot.value)
			player.inventory.updateSlot(slot, newItem)
		})
		player._client.write('held_item_slot', {
			slot: player.heldItemSlot
		})
	}

	function sendLogin () {
		// send init data so client will start rendering world
		player._client.write('login', {
			entityId: player.id,
			// levelType: 'default',
			gameMode: player.gameMode,
			previousGameMode: player.prevGameMode,
			// worldNames: Object.values(serv.dimensionNames),
			// worldNames: mcData.loginPacket.worldNames,
			worldNames: ['minecraft:overworld'],
			dimensionCodec: dimensionCodec,
			worldName: 'minecraft:overworld',
			// worldNames: mcData.loginPacket.worldNames,
			// dimension: serv.supportFeature('dimensionIsAString') ? serv.dimensionNames[0] : 0,
			dimension: mcData.loginPacket.dimension,
			hashedSeed: serv.hashedSeed,
			difficulty: serv.difficulty,
			viewDistance: settings['view-distance'],
			reducedDebugInfo: false,
			maxPlayers: Math.min(255, serv._server.maxPlayers),
			enableRespawnScreen: true,
			isDebug: false,
			isFlat: false
		})
		if (serv.supportFeature('difficultySentSeparately')) {
			player._client.write('difficulty', {
				difficulty: serv.difficulty,
				difficultyLocked: false
			})
		}
	}

	function sendChunkWhenMove () {
		player.on('move', () => {
			if (!player.sendingChunks && player.position.distanceTo(player.lastPositionChunkUpdated) > 16) { player.sendRestMap() }
			if (!serv.supportFeature('updateViewPosition')) {
				return
			}
			const chunkX = Math.floor(player.position.x / 16)
			const chunkZ = Math.floor(player.position.z / 16)
			const lastChunkX = Math.floor(player.lastPositionPlayersUpdated.x / 16)
			const lastChunkZ = Math.floor(player.lastPositionPlayersUpdated.z / 16)
			if (chunkX !== lastChunkX || chunkZ !== lastChunkZ) {
				player._client.write('update_view_position', {
					chunkX,
					chunkZ
				})
				player.lastPositionPlayersUpdated = player.position
			}
		})
	}

	function updateTime () {
		player._client.write('update_time', {
			age: [0, 0],
			time: [0, serv.time]
		})
	}

	player.setGameMode = (gameMode) => {
		if (gameMode !== player.gameMode) player.prevGameMode = player.gameMode
		player.gameMode = gameMode
		player._client.write('game_state_change', {
			reason: 3,
			gameMode: player.gameMode
		})
		serv._writeAll('player_info', {
			action: 1,
			data: [{
				UUID: player.uuid,
				gamemode: player.gameMode
			}]
		})
		player.sendAbilities()
	}

	function fillTabList() {
		const playerInfo = {
			action: 0,
			data: [{
				UUID: player.uuid,
				name: player.username,
				properties: player.profileProperties,
				gamemode: player.gameMode,
				ping: player._client.latency
			}]
		}

		if (player.isNpc)
			// TODO: change this to _writeOthersNearby and periodically check for nearby players to send the player_info to
			player._writeOthers('player_info', playerInfo)
		else
			player._writeOthers('player_info', playerInfo)

		player._client.write('player_info', {
			action: 0,
			data: serv.players.map((otherPlayer) => ({
				UUID: otherPlayer.uuid,
				name: otherPlayer.username,
				properties: otherPlayer.profileProperties,
				gamemode: otherPlayer.gameMode,
				ping: otherPlayer._client.latency
			}))
		})
		console.log('written player_info')
		setInterval(() => player._client.write('player_info', {
			action: 2,
			data: serv.players.filter(otherPlayer => otherPlayer.uuid !== undefined).map(otherPlayer => ({
				UUID: otherPlayer.uuid,
				ping: otherPlayer._client.latency
			}))
		}), 5000)
	}

	function announceJoin () {
		if (!player.isNpc)
			serv.broadcast(serv.color.yellow + player.username + ' joined the game')
		player.emit('connected')
	}

	player.waitPlayerLogin = (): Promise<void> => {
		const events = ['flying', 'look', 'position', 'position_look']
		return new Promise((resolve) => {
			const listener = () => {
				events.map(event => player._client.removeListener(event, listener))
				resolve()
			}
			events.map(event => player._client.on(event, listener))
		})
	}

	player.login = async () => {
		if (serv.uuidToPlayer[player.uuid]) {
			player.kick('You are already connected')
			return
		}
		if (serv.bannedPlayers[player.uuid]) {
			player.kick(serv.bannedPlayers[player.uuid].reason)
			return
		}
		if (!player.isNpc && serv.bannedIPs[player._client.socket.remoteAddress]) {
			player.kick(serv.bannedIPs[player._client.socket.remoteAddress].reason)
			return
		}

		await addPlayer()
		sendLogin()
		fillTabList()
		player.sendSpawnPosition()
		player.sendSelfPosition()
		player.sendAbilities()
		await player.sendMap()
		player.updateHealth(player.health)
		player.setXp(player.xp)
		updateInventory()

		updateTime()
		
		announceJoin()
		player.updateAndSpawn() // gotta do a timeout otherwise sometimes theyll be invisible
		player.spawned = true
		player.emit('spawned')

		await player.waitPlayerLogin()
		player.sendRestMap()
		sendChunkWhenMove()
	}

	const dimensionCodec = mcData.loginPacket.dimensionCodec
}
