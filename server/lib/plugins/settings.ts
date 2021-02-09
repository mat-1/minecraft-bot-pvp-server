import { MCPlayer, MCServer } from "../.."

const Vec3 = require('vec3').Vec3

function randomInt (low, high) {
	return Math.floor(Math.random() * (high - low) + low)
}

module.exports.server = function (serv, settings) {
	serv.gameMode = settings.gameMode
	serv.difficulty = settings.difficulty
	const mcData = require('minecraft-data')(settings.version)

	const waterBlocks = new Set([mcData.blocksByName.water.id])
	if (mcData.blocksByName.flowing_water !== undefined) {
		waterBlocks.add(mcData.blocksByName.flowing_water.id)
	}

	async function findSpawnZone (world, initialPoint) {
		let point = initialPoint
		while ((await (world.getBlockType(point))) === 0) { point = point.offset(0, -1, 0) }
		while (true) {
			const p = await world.getBlockType(point)
			if (!waterBlocks.has(p)) { break }
			point = point.offset(1, 0, 0)
		}
		while ((await world.getBlockType(point)) !== 0) { point = point.offset(0, 1, 0) }

		return point
	}

	serv.getSpawnPoint = async (world) => {
		return findSpawnZone(world, new Vec3(randomInt(0, 30), 81, randomInt(0, 30)))
	}
}

module.exports.player = async(player: MCPlayer, serv: MCServer) => {
	player.prevGameMode = 255
	player.gameMode = serv.gameMode
	player.findSpawnPoint = async(): Promise<typeof Vec3 | void> => {
		// player.spawnPoint = await serv.getSpawnPoint(player.world)
		player.spawnPoint = player.forceSpawnPoint || new Vec3(0.5, 80, 0.5)
		if (player.forceSpawnPoint) player.forceSpawnPoint = null
	}
	player._client.on('settings', ({ viewDistance, skinParts }) => {
		player.view = viewDistance
		player.setAndUpdateMetadata(parseSkinParts(skinParts))
	})

	function parseSkinParts(skinParts) {
		return {
			showCape: (skinParts & 0x1) !== 0,
			showJacket: (skinParts & 0x2) !== 0,
			showLeftSleeve: (skinParts & 0x4) !== 0,
			showRightSleeve: (skinParts & 0x8) !== 0,
			showLeftPants: (skinParts & 0x10) !== 0,
			showRightPants: (skinParts & 0x20) !== 0,
			showHat: (skinParts & 0x40) !== 0,
		}
	}

	// player.updateSkinParts = (skinParts) => {
	// 	const oldSkinParts = player.skinParts
	// 	const newSkinParts = parseSkinParts(skinParts)
	// 	player.skinParts = newSkinParts
	// 	if (oldSkinParts !== newSkinParts) {
	// 		player.sendMetadata([{
	// 			key: 16,
	// 			type: 0,
	// 			value: skinParts
	// 		}])
	// 	}
	// }


}
