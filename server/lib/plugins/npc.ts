import PVPBot from '../../../mineflayer-pvp'
import { createBot, Bot } from 'mineflayer'
import { states } from 'minecraft-protocol'
import type { MCServer } from '../..'
import { v4 as uuidv4 } from 'uuid'
import World from 'prismarine-world'
import { Vec3 } from 'vec3'
 
export interface NpcOptions {
	username: string,
	world?: World,
	position?: Vec3
}

class FakeClient extends require('events') {
	// emit(type, ...args) {
		// super.emit('event', type, ...args)
		// super.emit(type, ...args)
	// }
	write(type: string, data: any) {
		super.emit('event', type, data)
	}
	emit(type: string, data?: any) {
		const listeners = this.listeners(type)
		for (const listener of listeners) {
			if (data !== null) listener(data)
			else listener()
		}
	}
	registerChannel(protocolVersion: string, data: any) {}
	writeChannel(protocolVersion: string, data: any) {}
	end() {
		this.write('end', null)
	}
}

module.exports.server = (serv: MCServer, { version }) => {
	serv.createNPC = (options: NpcOptions): Promise<Bot> => {
		return new Promise((resolve: (...args: any[]) => void, reject) => {
			const client = new FakeClient()

			client.version = version

			const bot = createBot({
				username: options.username,
				client: client,
				version: version
			})
			bot._client.emit('connect')
			bot._client.state = states.PLAY
			bot._client.uuid = uuidv4()

			bot._client.username = options.username
			bot._client.latency = 0
			bot._client.profile = {
				properties: []
			}
			console.log('removeListener', bot._client.removeListener)

			const clientEvents: Map<string, Function[]> = new Map()

			const serverClient = {
				...bot._client,
				write: (type: string, data: any) => {
					bot._client.emit(type, data)
				},
				on: (type: string, callback: Function) => {
					if (clientEvents.has(type)) {
						clientEvents.set(type, [...clientEvents.get(type), callback])
					} else {
						clientEvents.set(type, [callback])
					}
				},
				removeListener: bot._client.removeListener,
				registerChannel(protocolVersion: string, data: any) {},
				writeChannel(protocolVersion: string, data: any) {},
				end() {
					bot._client.write('end', null)
				}
			}
			bot._client.on('event', (type, ...args) => {
				for (const [eventName, callbacks] of clientEvents) {
					if (type === eventName) {
						for (const callback of callbacks) callback(...args)
						return
					}
				}
			})

			serv._server.emit('login', serverClient, {
				isNpc: true,
				world: options.world,
				position: options.position
			})
			bot.once('spawn', () => {
				bot.once('physicTick', () => resolve(bot))
			})
		})
	}

	serv.commands.add({
		base: 'npc',
		info: 'Create an NPC',
		usage: '/npc',
		tab: [],
		op: true,
		parse(str) {
			return str.split(' ')
		},
		async action(args, ctx) {
			if (args.length >= 1 && args[0] === 'pvp') {
				const bot: any = await serv.createNPC({
					username: 'pvpNPC',
					world: ctx.player.world
				})
				PVPBot(bot)
				bot.pvp.start(ctx.player)
			} else {
				serv.createNPC({
					username: 'npc',
					world: ctx.player.world
				})
			}
		}
	})
}

module.exports.player = (player, serv) => {

}

module.exports.entity = function (entity, serv) {

}
