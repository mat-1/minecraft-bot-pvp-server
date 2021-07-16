import { Physics, PlayerState } from 'prismarine-physics'
import * as mcDataInitializer from 'minecraft-data'
import { Vec3 } from 'vec3'
import { MCPlayer, MCServer } from '../..'


function vec3MostlyEquals(a: Vec3, b: Vec3): Boolean {
	const difference: Vec3 = a.minus(b)
	const xDifference: number = Math.abs(difference.x)
	const yDifference: number = Math.abs(difference.y)
	const zDifference: number = Math.abs(difference.z)
	return xDifference * xDifference + yDifference * yDifference + zDifference * zDifference <= 9.0E-4
}

function vec3FloatEquals(a: Vec3, b: Vec3) {
	const difference: Vec3 = a.minus(b)
	const xDifference: number = Math.abs(difference.x)
	const yDifference: number = Math.abs(difference.y)
	const zDifference: number = Math.abs(difference.z)
	return xDifference < 0.00001 && yDifference < 0.00001 && zDifference < 0.00001
}

function lerp(v0: number, v1: number, t: number) {
    return v0 * (1 - t) + v1 * t
}

interface ControlState {
	forward: boolean
	back: boolean,
	left: boolean,
	right: boolean,
	sneak: boolean,
	sprint: boolean,
	jump: boolean

}

export interface State {
	pos: Vec3
	vel: Vec3
	control: ControlState
	yaw: number
	pitch: number
	onGround: boolean
	isCollidedHorizontally: boolean
	isCollidedVertically: boolean
	isInWater: boolean
	isInLava: boolean
	isInWeb: boolean
	jumpTicks: number
	jumpQueued: boolean
}



function calculateApproximateGcd(items: number[]) {
	items = items.sort((a, b) => a - b)
	let bestN = 0
	let bestDeviation = 1

	// this is kinda inefficient but it works well
	for (let n = 1; n < 200; n ++) {
		let highestDeviationForN = 0
		for (const item of items.slice(1)) {
			let deviation = (item / (items[0] / n)) % 1
			deviation = Math.min(deviation, 1 - deviation)
			if (deviation > highestDeviationForN)
				highestDeviationForN = deviation
		}

		if (highestDeviationForN < bestDeviation) {
			bestDeviation = highestDeviationForN
			bestN = n
		}
	}

	console.log('bestDeviation:', bestDeviation)
	return items[0] / bestN
}

function reverseSensitivity(s: number) {
	let d6 = s / .15 / 8
	let d5 = Math.cbrt(d6)
	return Math.max((d5 - .2) / .3, 0)
}

module.exports.player = function (player: MCPlayer, serv: MCServer, { version }) {
	const mcData = mcDataInitializer(version)

	player.state = {
		vel: new Vec3(0, 0, 0),
	}

	function simulateMove(physics: any, originalState: any, yaw: number, pitch: number, controlStates: ControlState) {
		const state: Partial<State> = {
			pos: originalState.pos.clone(),
			vel: originalState.vel.clone(),
			control: controlStates,
			yaw: yaw,

			onGround: player.previousState.onGround,
			isCollidedHorizontally: player.previousState.isCollidedHorizontally,
			isCollidedVertically: player.previousState.isCollidedVertically,

			isInWater: false,
			isInLava: false,
			isInWeb: false,
			jumpTicks: 0,
			jumpQueued: false
		}
		const world = {
			getBlock: (position: Vec3) => {
				// for some reason the position isnt provided normally sometimes, so we have to do this
				const block = player.world.sync.getBlock(position)
				if (block === null) return null
				block.position = position
				return block
			}
		}

		physics.simulatePlayer(state, world)
		return state
	}

	function generatePotentialPositions(previousState: any, yaw: number, pitch: number): any[] {
		const physics = Physics(mcData, player.world)
		const potentialPositions: any[] = []
		for (const forwardDirection of [null, 'forward', 'back']) {
			// for (const sidewaysDirection of [null, 'right', 'left']) {
			// const forwardDirection = null
			const sidewaysDirection = null
			const jump = false
				// for (const jump of [false, true]) {
					const control: ControlState = {
						forward: forwardDirection === 'forward',
						back: forwardDirection === 'back',
						left: sidewaysDirection === 'left',
						right: sidewaysDirection === 'right',
						sneak: false,
						sprint: false,
						jump: jump
					}
					let simulated = simulateMove(physics, previousState, yaw, pitch, control)
					if (vec3MostlyEquals(simulated.pos, previousState.pos)) {
						simulated = simulateMove(physics, simulated, yaw, pitch, control)
					}
					potentialPositions.push(simulated)
				// }
			// }
		}
		return potentialPositions
	}

	function positionUpdate(position: Vec3) {
		player.state.pos = position
		if (!player.world) return
		if (player.previousState) {
			const potentialSimulations: any[] = generatePotentialPositions(player.previousState, player.state.yaw, player.state.pitch)
			const potentialSimulationPositions = []
			let correctSimulation = null
			for (const simulation of potentialSimulations) {
				potentialSimulationPositions.push(simulation.pos)
				if (vec3FloatEquals(position, simulation.pos)) {
					correctSimulation = simulation
					break
				}
			}
			if (correctSimulation) {
				// console.log('good, velocity set', correctSimulation.vel, correctSimulation.pos)
				// console.log(Date.now(), position, correctSimulation.pos)
				player.state = correctSimulation
				// console.log(player.state)
			} else {
				// console.log('player is hacking!!!', position, potentialSimulationPositions)
				// console.log(Date.now(), position, potentialSimulationPositions[0])
				player.state = potentialSimulationPositions[0]
				player.state.pos = position

				player.state.vel = position.minus(player.previousState.pos)
				// console.log('set velocity to', player.state.vel)
			}
		} else {
			player.state.onGround = false
			player.state.isCollidedHorizontally = false
			player.state.isCollidedVertically = false
		}
		if (!player.previousState) player.previousState = {}
		Object.assign(player.previousState, player.state)
	}

	let rawYaw: number
	let rawPitch: number

	// a set of distances the mouse moved, for example [ .30, 0.45 ]
	const lookDifferences: Set<number> = new Set()
	// whether it's certain that the sensitivity it guessed is correct
	let certainAboutSensitivity = false

	// *yawn*
	const lowestPossibleSensitivity = 0.00950
	// hyperspeed
	const highestPossibleSensitivity = 0.61438

	let sensitivity: number = highestPossibleSensitivity

	function calculateModuloForLook(look: number, s: number): number {
		let modulo =  Math.abs(look % s)
		return Math.min(modulo, s - modulo)
	}

	function isUnacceptableLook(look: number, s: number): boolean {
		// if (look < 0.00005) return false // sometimes the look direction is really low, idk why
		return calculateModuloForLook(look, s) > 0.005
			&& calculateModuloForLook(360 - look, s) > 0.005
	}

	let previousMouseSpeed = 0
	let positionReset = false

	let rawYawDifference: number
	let rawPitchDifference: number
	let rawYawDifference2: number
	let rawPitchDifference2: number

	function updateLook(yaw: number, pitch: number) {
		if (player.isNpc) return
		if (Math.fround(yaw) !== yaw && Math.fround(pitch) !== pitch) {
			console.log('player\'s yaw/pitch isn\'t a float! they are hacking!')
			player.kick('Cheating :(')
			return
		}

		let previousRawYaw = rawYaw
		let previousRawPitch = rawPitch
		rawYaw = yaw
		rawPitch = pitch
		rawYawDifference = Math.abs(previousRawYaw - yaw)
		rawPitchDifference = Math.abs(previousRawPitch - pitch)

		// the player was teleported or something, ignore this tick
		if (positionReset) {
			positionReset = false
			console.log('ok positions reset, facing', yaw, pitch)
			// remove the last two (because yaw and pitch) things
			lookDifferences.delete(Array.from(lookDifferences)[lookDifferences.size - 1])
			lookDifferences.delete(Array.from(lookDifferences)[lookDifferences.size - 1])
			return
		}

		let previousRawYawDifference = rawYawDifference
		let previousRawPitchDifference = rawPitchDifference
		let previousRawYawDifference2 = rawYawDifference2
		let previousRawPitchDifference2 = rawPitchDifference2
		rawYawDifference2 = previousRawYawDifference - rawYawDifference
		rawPitchDifference2 = previousRawPitchDifference - rawPitchDifference
		// console.log(previousRawYawDifference2, rawYawDifference2)
		// return
		// if (rawYawDifference < lowestPossibleSensitivity && rawPitchDifference < lowestPossibleSensitivity) return console.log('probably in cinematic camera')
		console.log(rawYawDifference, rawPitchDifference, yaw, pitch)

		if (previousRawYaw !== undefined) {
			if (certainAboutSensitivity) {
				if (
					// idk why but the pitch being 90 affects the yaw sometimes???
					(pitch !== 90 && pitch !== -90 && isUnacceptableLook(rawYawDifference, sensitivity))
					|| (pitch !== 90 && pitch !== -90 && isUnacceptableLook(rawPitchDifference, sensitivity))
				) {
					console.log('difference:', rawYawDifference, rawPitchDifference)
					console.log('look direction is impossible!')
					return player.kick('Cheating :(')
				}
				// since we know the sensitivity, we can calculate how fast the player's mouse is going
				const mouseSpeed = Math.hypot(rawYawDifference, rawPitchDifference) / sensitivity
				const mouseAcceleration = mouseSpeed - previousMouseSpeed
				// console.log(mouseAcceleration)
				// moving the mouse this fast is not physically possible, my record is 5483
				// this is disabled because i need to figure out a way to detect when the server forces the mouse to move
				// if (mouseSpeed > 10000) {
				// 	console.log('headsnap!')
				// 	return player.kick('Cheating :(')
				// } else if (mouseAcceleration > 3000) {
				// 	console.log('mouse accelerated too fast!')
				// 	return player.kick('Cheating :(')
				// }
				previousMouseSpeed = mouseSpeed
			} else {
				if (
					rawYawDifference !== 0
					&& yaw !== 0
					&& rawPitchDifference < 180 // sometimes this breaks things
					// make sure there's not already a similar number
					&& !Array.from(lookDifferences).find(d => Math.abs(d - rawYawDifference) < .001)
				) {
					lookDifferences.add(rawYawDifference)
				} if (
					rawPitchDifference !== 0
					&& pitch !== 90 && pitch !== -90
					// make sure there's not already a similar number
					&& !Array.from(lookDifferences).find(d => Math.abs(d - rawPitchDifference) < .001)
				) {
					lookDifferences.add(rawPitchDifference)
				}
			
				if (lookDifferences.size >= 10) {
					sensitivity = calculateApproximateGcd(Array.from(lookDifferences))
					console.log('calculated sensitivity:', sensitivity)
					if (sensitivity < lowestPossibleSensitivity) {
						console.log('player\'s sensitivity is too low', sensitivity)
						player.kick('Cheating :(')
					}
					certainAboutSensitivity = true
					const reversedSensitivity = reverseSensitivity(sensitivity)
					console.log('ok! calculated sensitivity to be', sensitivity, 0)
					console.log('client-side sensitivity:', reversedSensitivity * 100, lookDifferences)
					player.chat(`Calculated your sensitivity to be ${Math.floor(reversedSensitivity * 100 + .02)}%`)
				}
			}
		}
		// player.state.yaw = (-yaw + 180) * Math.PI / 180
		// player.state.pitch = pitch * Math.PI / 180
	}

	let settingsPacketsInThisTick = 0

	player._client.on('settings', (data) => {
		settingsPacketsInThisTick += 1
	})

	player.on('tick', () => {
		if (settingsPacketsInThisTick === 2) {
			sensitivity = highestPossibleSensitivity
			certainAboutSensitivity = false
			lookDifferences.clear()
			console.log('looks like the player changed their sensitivity setting')
		}
		settingsPacketsInThisTick = 0
	})

	player.on('position', () => {
		positionReset = true
	})

	player._client.on('position', ({ x, y, z, onGround }: any = {}) => {
		return
		player.state.onGround = onGround
		positionUpdate(new Vec3(x, y, z))
	})
	
	player._client.on('position_look', ({ x, y, z, onGround, yaw, pitch }: any = {}) => {
		updateLook(yaw, pitch)
		player.state.onGround = onGround
		positionUpdate(new Vec3(x, y, z))
	})

	player._client.on('look', ({ yaw, pitch }: any = {}) => {
		updateLook(yaw, pitch)
	})
}
