import * as mc from 'minecraft-protocol'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as requireIndex from './lib/requireindex'
import { supportedVersions } from './lib/version'
import * as Command from './lib/command'

import type { PlaceItemData, InteractBlockData } from './lib/plugins/placeBlock'
import type { putBlockEntityOptions, removeBlockEntityOptions } from './lib/plugins/blockEntities'
import type { NpcOptions } from './lib/plugins/npc'
import type { Loc } from './lib/plugins/communication'
import { Bot } from 'mineflayer'


import type { Chunk } from 'prismarine-chunk'
import type { Block } from 'prismarine-block'
import type World from 'prismarine-world'
import type { Vec3 } from 'vec3'

require('emit-then').register()
if (process.env.NODE_ENV === 'dev') {
	require('longjohn')
}

import * as supportFeature from './lib/supportFeature'

export default function createMCServer(options={}): MCServer {
	const mcServer = new MCServer()
	mcServer.connect(options)
	return mcServer
}

interface AddressInfo {
	host: string
	port: number,
}

interface NetServer {
	address(): AddressInfo
}

declare module 'minecraft-protocol' {
	interface Server {
		on(event: 'connection', handler: (client?: mc.Client) => void): this
		on(event: 'error', listener: (error?: Error) => void): this
		on(event: 'login', handler: (client?: mc.Client) => void): this
		on(event: 'listening', handler: (client?: mc.Client) => void): this
		socketServer?: NetServer
	}
}

class NMPServer extends require('minecraft-protocol').Server {

}

export class MCServer extends EventEmitter {
	_server: NMPServer
	commands: any

	supportFeature: (feature: string) => boolean

	createLog: () => void
	log: (string) => void

	players: any[]
	hub: World
	gameServers: World[]

	// tick
	tickCount: number
	lastTickTime: number
	tickInterval: NodeJS.Timeout
	stopTickInterval: () => void
	setTickInterval: (ticksPerSecond: number) => void

	// world
	pregenWorld: (world: World, size: number) => Promise<any[]>
	setBlock: (world: World, position: Vec3, stateId: number) => Promise<void>
	setBlockType: (world: World, position: Vec3, id: number) => Promise<void>
	setBlockAction: (world: World, position: Vec3, actionId: number, actionParam: number) => Promise<void>
	reloadChunks: (world: World, chunks: Chunk[]) => void

	// blockUpdates
	MAX_UPDATES_PER_TICK: number
	updateBlock: (world: World, pos: Vec3, fromTick: any, tick: any, forceNotify?: boolean, data?: any) => void
	notifyNeighborsOfStateChange: (world: World, pos: Vec3, fromTick: any, tick: any, forceNotify?: boolean, data?: any) => void
	notifyNeighborsOfStateChangeDirectional: (world: World, pos: Vec3, dir: Vec3, fromTick: any, tick: any, forceNotify?: boolean, data?: any) => void
	onBlockUpdate: (name: string, handler: (world: World, block: Block, fromTick: any, tick: any, data: any) => any) => void

	// placeBlock
	placeItem: (data: PlaceItemData) => any
	onItemPlace: (name: string, handler: (data: any) => any, warn?: boolean) => void
	setBlockDataProperties: (baseData: number, states: any[], properties: any) => number
	interactWithBlock: (data: InteractBlockData) => Promise<boolean>
	onBlockInteraction: (name: string, handler: (data: InteractBlockData) => boolean) => void

	// blockEntities
	putBlockEntity: (putBlockEntityOptions) => Promise<void>
	removeBlockEntity: (removeBlockEntityOptions) => Promise<void>

	// npc
	createNPC: (options: NpcOptions) => Promise<Bot>

	// communication
	_writeAll: (packetName: string, packetFields: any) => void
	_writeArray: (packetName: string, packetFields: any, players: any[]) => void
	_writeNearby: (packetName: string, packetFields: any, loc: Loc) => void
	// TODO: make this entities[] instead of any[]
	getNearby: ({ world, position, radius }: Loc) => any[]
	getNearbyEntities: ({ world, position, radius }: Loc) => any[]

	// entities (todo)
	entities: any[]

	constructor () {
		super()
		this._server = null
	}

	connect(options) {
		const version = require('minecraft-data')(options.version).version
		if (!supportedVersions.some(v => v.includes(version.majorVersion))) {
			throw new Error(`Version ${version.minecraftVersion} is not supported.`)
		}
		this.supportFeature = feature => supportFeature(feature, version.majorVersion)

		const plugins = requireIndex(path.join(__dirname, 'lib', 'plugins'))
		this.commands = new Command({})
		this._server = mc.createServer(options)
		Object.keys(plugins)
			.filter(pluginName => plugins[pluginName].server !== undefined)
			.forEach(pluginName => plugins[pluginName].server(this, options))
		if (options.logging === true) this.createLog()
		this._server.on('error', error => this.emit('error', error))
		this._server.on('listening', () => this.emit('listening', this._server.socketServer.address().port))
		this.emit('asap')
	}
}
