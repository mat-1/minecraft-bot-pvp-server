import type { ChatMessage } from './chat'

interface TitleDisplay {
	fadeIn: number
	stay: number
	fadeOut: number
}

interface Title {
	title?: ChatMessage
	subtitle?: ChatMessage
	actionBar?: ChatMessage
	display?: TitleDisplay
}

module.exports.player = function (player, serv) {
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
	}
}