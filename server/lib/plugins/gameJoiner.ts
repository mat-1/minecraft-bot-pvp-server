const Vec3 = require('vec3').Vec3
import * as WorldConstructor from 'prismarine-world'
import { Anvil as AnvilConstructor } from 'prismarine-provider-anvil'
import PVPBot from '../../../mineflayer-pvp'
import type { MCServer } from '../..'

module.exports.server = (serv: MCServer) => {
	const Anvil = AnvilConstructor(serv._server.version)
	const World = WorldConstructor(serv._server.version)

	serv.commands.add({
		base: 'pvp',
		info: 'Join a pvp match',
		usage: '/pvp',
		onlyPlayer: true,
		op: false,
		parse (str) {
			return {}
		},
		async action(action, ctx) {
			const arenaWorlds = ['arena1', 'arena2', 'arena3']
			const arenaWorld = arenaWorlds[Math.floor(Math.random() * arenaWorlds.length)]
			const gameWorld = new World(null, new Anvil('./worlds/' + arenaWorld))
			// const gameWorld = ctx.player.world
			serv.gameServers.push(gameWorld)
			ctx.player.changeWorld(
				gameWorld,
				{
					spawnpoint: new Vec3(15.5, 65, 0.5)
				}
			)
			ctx.player.updateHealth(20)
			const bot = await serv.createNPC({
				username: 'bot',
				world: gameWorld,
				position: new Vec3(-14.5, 65, 0.5)
			})
			PVPBot(bot)
			bot.pvp.start(ctx.player)
			bot.once('death', () => {
				console.log('bot died lol')
				ctx.player.title({
					title: {'text': 'You win!', 'color': '#00ff00'},
					subtitle: {'text': 'Do /pvp to play again', 'italic': true, 'color': '#6b6b6b'},
					display: {
						fadeIn: .5,
						stay: 5,
						fadeOut: 2,
					}
				})
				bot._client.end(null)
			})

			// check if the world isn't being used anymore every 10 seconds
			const worldDestroyerInterval = setInterval(() => {
				if (serv.isWorldInactive(gameWorld)) {
					console.log('world is being destroyed!')
					serv.destroyWorld(gameWorld)
					clearInterval(worldDestroyerInterval)
				}
			}, 1000)
		}
	})
}

module.exports.player = (player, serv) => {

}

module.exports.entity = function (entity, serv) {

}
