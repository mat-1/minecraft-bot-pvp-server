import { LimitedBot } from './base'
import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'

interface PvpConfig {
	cps: number
}

export interface BotPvp {
	config?: PvpConfig
	opponent?: Entity

	start?: (opponent: Entity) => void
	end?: () => void
}

async function tick(bot: LimitedBot, opponent: Entity, config: PvpConfig) {
	await bot.lookAt(opponent.position.offset(0, 1.62, 0))
	if (config.cps > 0 && bot.aliveTick % Math.ceil(20 / config.cps) == 0)
		bot.attack()
	if (bot.position.distanceTo(opponent.position) > 2) {
		bot.setControlState('forward', true)
		if (bot.position.distanceTo(opponent.position) > 6) {
			bot.setControlState('jump', true)
			bot.setControlState('sprint', true)
		}
	} else {
		bot.setControlState('forward', false)
		bot.setControlState('jump', false)
	}
}


export default function plugin(bot: any) {
	const limitedBot = new LimitedBot(bot)
	
	bot.pvp = {}

	let listener = () => {
		tick(limitedBot, bot.pvp.opponent, bot.pvp.config)
	}

	bot.pvp.start = (opponent: Entity, config?: PvpConfig) => {
		bot.pvp.opponent = opponent
		if (config) bot.pvp.config = config
		bot.on('physicTick', listener)
		// init(limitedBot, bot.pvp.opponent, bot.pvp.config)
	}
	bot.pvp.end = () => {
		bot.pvp.opponent = null
		bot.removeListener('physicTick', listener)
	}
	bot.pvp.config = {
		cps: 5
	}
}