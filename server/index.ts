import * as mc from 'minecraft-protocol'
import { EventEmitter } from 'events'
import { supportedVersions } from './lib/version'
import * as Command from './lib/command'
import plugins from './lib/plugins'

import type { PlaceItemData, InteractBlockData } from './lib/plugins/placeBlock'
import type { putBlockEntityOptions, removeBlockEntityOptions } from './lib/plugins/blockEntities'
import type { NpcOptions } from './lib/plugins/npc'
import type { Loc } from './lib/plugins/communication'
import { Bot } from 'mineflayer'


import type { Chunk } from 'prismarine-chunk'
import type { Block } from 'prismarine-block'
import type World from 'prismarine-world'
import type { Vec3 } from 'vec3'
import type { CommandDispatcher } from 'node-brigadier'

require('emit-then').register()
if (process.env.NODE_ENV === 'dev') {
	require('longjohn')
}

import * as supportFeature from './lib/supportFeature'
import type { CompleteWindowInterface as CompleteWindow, InventoryTypes } from './lib/plugins/windows'
import type { ChatMessage } from './lib/plugins/chat'
import type { Item } from 'prismarine-item'
import type { Entity } from 'prismarine-entity'
import type { Window } from 'prismarine-windows'

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

class NMPClient extends require('minecraft-protocol').Client {

}

interface Color {
	black: string
	dark_blue: string
	dark_green: string
	dark_red: string
	purple: string
	dark_purple: string
	gold: string
	gray: string
	grey: string
	dark_gray: string
	dark_grey: string
	blue: string
	green: string
	aqua: string
	cyan: string
	red: string
	pink: string
	light_purple: string
	yellow: string
	white: string
	random: string
	obfuscated: string
	bold: string
	strikethrough: string
	underlined: string
	underline: string
	italic: string
	italics: string
	reset: string
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
	destroyWorld: (world: World) => void
	isWorldInactive: (world: World) => boolean
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
	onBlockInteraction: (name: string, handler: (data: InteractBlockData) => Promise<boolean>) => void

	// blockEntities
	putBlockEntity: (putBlockEntityOptions) => Promise<void>
	removeBlockEntity: (removeBlockEntityOptions) => Promise<void>

	// npc
	createNPC: (options: NpcOptions) => Promise<Bot>

	// communication
	_writeAll: (packetName: string, packetFields: any) => void
	_writeArray: (packetName: string, packetFields: any, players: MCPlayer[]) => void
	_writeNearby: (packetName: string, packetFields: any, loc: Loc) => void
	getNearby: ({ world, position, radius }: Loc) => MCPlayer[]
	getNearbyEntities: ({ world, position, radius }: Loc) => (MCEntity | MCPlayer)[]

	// entities (todo)
	entities: any[]

	// brigadier
	brigadier: CommandDispatcher<unknown>

	// chat (todo)
	color: Color

	// windows
	createWindow: (windowType: CompleteWindow, id: number, type: number | string, title: string, slotCount?: number, player?: MCPlayer) => any

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

export interface MCEntity extends Entity {
	world: World
	viewDistance: number
	id: number
	gameMode: number

	nearbyEntities: (MCEntity | MCPlayer)[]

	// spawn (TODO)
	destroy: () => void

	// communication
	getNearby: () => (MCEntity | MCPlayer)[]
	getOtherPlayers: () => MCPlayer[]
	getOthers: () => MCEntity[]
	getNearbyPlayers: () => MCPlayer[]
	nearbyPlayers: () => MCPlayer[]
	_writeOthers: (packetName: string, packetFields: any) => void
	_writeOthersNearby: (packetName: string, packetFields: any) => void
	_writeNearby: (packetName: string, packetFields: any) => void

	// sound (TODO)
	playSoundAtSelf: (sound: string, opt?: any) => void
}

export interface MCPlayer extends MCEntity {
	_client: NMPClient

	// containers
	openWindow: (inventoryType: InventoryTypes, name: ChatMessage | string, windowType?: CompleteWindow) => void

	// inventory
	heldItemSlot: number
	heldItem: Item
	inventory: Window
	updateHeldItem: () => void
	collect: (collectEntity: MCItemEntity) => void
}

export interface MCItemEntity extends MCEntity {
	itemId: number
	damage: number // does this actually exist? doesnt look like it
}