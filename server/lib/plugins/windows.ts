import { InteractBlockData } from './placeBlock'
import { Vec3 } from 'vec3'
import { MCPlayer, MCServer } from '../..'
import { ChatMessage } from './chat'
import * as WindowsConstructor from 'prismarine-windows'
import { WindowsExports } from 'prismarine-windows'
import { CommandDispatcher, literal } from 'node-brigadier'
import { isPartiallyEmittedExpression } from 'typescript'

const vecArray = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)]

export enum InventoryTypes {
	generic_9x1 = 'minecraft:generic_9x1',
	generic_9x2 = 'minecraft:generic_9x2',
	generic_9x3 = 'minecraft:generic_9x3',
	generic_9x4 = 'minecraft:generic_9x4',
	generic_9x5 = 'minecraft:generic_9x5',
	generic_9x6 = 'minecraft:generic_9x6',
	generic_3x3 = 'minecraft:generic_3x3',
	anvil = 'minecraft:anvil',
	beacon = 'minecraft:beacon',
	blast_furnace = 'minecraft:blast_furnace',
	brewing_stand = 'minecraft:brewing_stand',
	crafting = 'minecraft:crafting',
	enchantment = 'minecraft:enchantment',
	furnace = 'minecraft:furnace',
	grindstone = 'minecraft:grindstone',
	hopper = 'minecraft:hopper',
	lectern = 'minecraft:lectern',
	loom = 'minecraft:loom',
	merchant = 'minecraft:merchant',
	shulker_box = 'minecraft:shulker_box',
	smoker = 'minecraft:smoker',
	cartography = 'minecraft:cartography',
	stonecutter = 'minecraft:stonecutter',
}

interface ItemSlot {
	present: boolean,
	itemId?: number,
	itemCount?: number,
	nbtData?: any
}

interface ClickInfo {
	windowId: number,
	slot: number,
	mouseButton: number,
	action: number,
	mode: number,
	item: ItemSlot
}

export interface CompleteWindowInterface extends Window {
	player?: MCPlayer
}


module.exports.server = (serv: MCServer, { version }) => {
	// @ts-expect-error
	const windows: WindowsExports = WindowsConstructor(version)
	const Window = windows.Window

	const windowByType = new Map()
	for (const key of Object.keys(windows.windows)) {
		const win = windows.windows[key]
		if (win) {
			windowByType.set(win.type, win)
			// @ts-expect-error
			win.key = key
		}
	}

	class CompleteWindow extends Window {
		player?: MCPlayer

		acceptClick (click) {
			if (click.slot === -999) {
			  this.acceptOutsideWindowClick(click)
			} else if (click.slot >= this.inventoryStart && click.slot < this.inventoryEnd) {
			  this.acceptInventoryClick(click)
			} else if (click.slot === this.craftingResultSlot) {
			  this.acceptCraftingClick(click)
			} else {
			  this.acceptNonInventorySwapAreaClick(click)
			}
		}
	}

	class InventoryWindow extends CompleteWindow {
		
	}
	
	class ImmutableWindow extends CompleteWindow {
		acceptNonInventorySwapAreaClick(click: ClickInfo) {
			return
		}
	}
	
	module.exports.InventoryWindow = InventoryWindow
	module.exports.CompleteWindow = CompleteWindow
	module.exports.ImmutableWindow = ImmutableWindow

	serv.createWindow = (windowType: CompleteWindowInterface, id: number, type: number | string, title: string, slotCount?: number, player?: MCPlayer) => {
		let winData = windowByType.get(type)
		if (!winData) winData = windows.windows[type]
		if (!winData) {
		  if (slotCount === null) return null
		  winData = {
			type,
			key: type,
			inventory: { start: slotCount, end: slotCount + 35 },
			slots: slotCount + 36,
			craft: -1,
			requireConfirmation: type !== 'minecraft:container'
		  }
		}
		slotCount = winData.slots
		// @ts-expect-error idk how to make this work
		const window = new windowType(id, winData.key, title, slotCount, winData.inventory, winData.craft, winData.requireConfirmation, player)
		if (player) window.player = player
		return window
	}

	let currentWindowId = 0

	module.exports.player = (player: MCPlayer) => {
		player.openWindow = (inventoryType: InventoryTypes, name: ChatMessage | string, windowType?: CompleteWindowInterface): typeof Window.prototype => {
			currentWindowId ++
			// @ts-expect-error typescript moment
			const window = serv.createWindow(windowType || CompleteWindow, currentWindowId, inventoryType, JSON.stringify(name))
			player._client.write('open_window', {
				windowId: window.id,
				inventoryType: windows.windows[window.type].type,
				windowTitle: window.title,
			})
			const windowClick = (clickInfo: ClickInfo) => {
				window.acceptClick(clickInfo)
			}
			player.on(`window_click:${window.id}`, windowClick)
			return window
		}

		player._client.on('window_click', (clickInfo) => {
			player.emit(`window_click:${clickInfo.windowId}`, clickInfo)
		})
	}

	serv.on('asap', () => {
		serv.onBlockInteraction('chest', async({ player, block }: InteractBlockData): Promise<boolean> => {
			const blockAbove = await player.world.getBlock(block.position.offset(0, 1, 0))
			if (blockAbove.boundingBox !== 'empty') return false
			player.openWindow(InventoryTypes.generic_9x3, 'Chest')
			return true
		})
	})
}

module.exports.brigadier = (dispatcher: CommandDispatcher<unknown>, serv) => {
	dispatcher.register(	
		literal('window')
			.requires((c: any) => c.player.op)
			.executes(c => {
				const source: any = c.getSource()
				const player: MCPlayer = source.player
				player.openWindow(InventoryTypes.generic_9x3, 'Window')
				return 0
			})
	)
}