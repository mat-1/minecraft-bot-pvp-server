import { MCPlayer } from '../..'
import type { ChatMessage } from './chat'

interface TitleDisplay {
	fadeIn: number
	stay: number
	fadeOut: number
}

export interface Title {
	title?: ChatMessage
	subtitle?: ChatMessage
	actionBar?: ChatMessage
	display?: TitleDisplay
}

module.exports.player = function (player: MCPlayer, serv) {
	let hasTitleClearListener = false

	player.title = ({ title, subtitle, actionBar, display }: Title) => {
		if (display) {
			player._client.write('title', {
				action: 3,
				// it's in ticks, so multiply by 20
				fadeIn: Math.round(display.fadeIn * 20),
				stay: Math.round(display.stay * 20),
				fadeOut: Math.round(display.fadeOut * 20),
			})
		}
		if (title)
			player._client.write('title', {
				action: 0,
				text: JSON.stringify(title)
			})
		if (subtitle)
			player._client.write('title', {
				action: 1,
				text: JSON.stringify(subtitle)
			})
		if (actionBar)
			player._client.write('title', {
				action: 2,
				text: JSON.stringify(actionBar)
			})
		if ((title || subtitle || actionBar) && !hasTitleClearListener) {
			hasTitleClearListener = true
			player.once('change_world', () => {
				player._client.write('title', {
					// hide the title when the player changes worlds
					action: 4
				})
				hasTitleClearListener = false
			})
		}
	}

	player.actionBar = (text: ChatMessage) => {
		player.title({ actionBar: text })
	}
}