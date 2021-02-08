const Vec3 = require('vec3').Vec3
import * as WorldConstructor from 'prismarine-world'
import { Anvil as AnvilConstructor } from 'prismarine-provider-anvil'
import PVPBot from '../../mineflayer-pvp'
import type { MCServer } from '../'
import { CommandDispatcher } from 'node-brigadier'

const arenaWorlds = ['arena1', 'arena2', 'arena3']

module.exports.server = (serv: MCServer) => {
	const Anvil = AnvilConstructor(serv._server.version)
	const World = WorldConstructor(serv._server.version)

	async function doPvpMatch(player) {
		const arenaWorld = arenaWorlds[Math.floor(Math.random() * arenaWorlds.length)]
		const gameWorld = new World(null, new Anvil('./worlds/' + arenaWorld))
		// const gameWorld = ctx.player.world
		serv.gameServers.push(gameWorld)
		player.changeWorld(
			gameWorld,
			{
				spawnpoint: new Vec3(15.5, 65, 0.5)
			}
		)
		player.updateHealth(20)
		const bot = await serv.createNPC({
			username: 'bot' + Math.floor(Math.random() * 10000),
			world: gameWorld,
			position: new Vec3(-14.5, 65, 0.5)
		})
		PVPBot(bot)
		bot.pvp.start(player)
		bot.once('death', () => {
			console.log('bot died lol')
			player.title({
				title: {'text': 'You win!', 'color': '#00ff00'},
				subtitle: {'text': 'Do /pvp to play again', 'italic': true, 'color': '#6b6b6b'},
				display: {
					fadeIn: .5,
					stay: 5,
					fadeOut: 2,
				}
			})
			bot._client.end(null)
			setTimeout(() => {
				// if the player hasn't done /pvp, show an actionbar message
				const actionBarInterval = setInterval(() => {
					if (player.world === gameWorld) {
						player.actionBar({'text': 'Do /pvp to play again', 'italic': true, 'color': '#6b6b6b'})
					} else {
						clearInterval(actionBarInterval)
					}
				}, 1000)
		}, 7500)
		})
	
		// check if the world isn't being used anymore every second
		setTimeout(() => { // wait 5 seconds before initially destroying to make sure everything is initialized properly
			const worldDestroyerInterval = setInterval(() => {
				if (serv.isWorldInactive(gameWorld)) {
					console.log('world is being destroyed!', serv.players.filter(p => p.isNpc && p.world === gameWorld).map(p => p.username))
					serv.destroyWorld(gameWorld)
					clearInterval(worldDestroyerInterval)
				}
			}, 1000)
		}, 5000)
	
	}
	module.exports.brigadier = (dispatcher: CommandDispatcher<unknown>, serv, { literal }) => {
		dispatcher.register(	
			literal('pvp')
				.executes(c => {
					const source: any = c.getSource()
					doPvpMatch(source.player)
					return 0
				})
			)
	}
}
