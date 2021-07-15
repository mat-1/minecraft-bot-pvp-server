import { Physics, PlayerState } from 'prismarine-physics'
import * as mcDataInitializer from 'minecraft-data'
import { Vec3 } from 'vec3'
import { MCServer } from '../..'


function vec3MostlyEquals(a: Vec3, b: Vec3): Boolean {
	const difference: Vec3 = a.minus(b)
	const xDifference: number = Math.abs(difference.x)
	const yDifference: number = Math.abs(difference.y)
	const zDifference: number = Math.abs(difference.z)
	return xDifference * xDifference + yDifference * yDifference + zDifference * zDifference <= 9.0E-4
}

function floatEquals(a: Vec3, b: Vec3) {
	const difference: Vec3 = a.minus(b)
	const xDifference: number = Math.abs(difference.x)
	const yDifference: number = Math.abs(difference.y)
	const zDifference: number = Math.abs(difference.z)
	return xDifference < 0.00001 && yDifference < 0.00001 && zDifference < 0.00001
}


module.exports.player = function (player, serv: MCServer, { version }) {
	const mcData = mcDataInitializer(version)

	player.state = {
		vel: new Vec3(0, 0, 0),
	}

	function simulateMove(physics: any, originalState: any, yaw: number, pitch: number, controlStates: any) {
		const state = {
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
					const control = {
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
				if (floatEquals(position, simulation.pos)) {
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
		let modulo = look % sensitivity
		if (modulo > s / 2)
			modulo -= s
		console.log(modulo, look)
		return modulo
	}

	function isUnacceptableLook(look: number, s: number): boolean {
		if (look < 0.00005) return false // sometimes the look direction is really low, idk why
		// be more generous when the look is higher
		return (calculateModuloForLook(look, s) > 0.00225 * look)
	}

	let previousMouseSpeed = 0
	let positionReset = false

	function updateLook(yaw: number, pitch: number) {
		if (player.isNpc) return
		if (Math.fround(yaw) !== yaw && Math.fround(pitch) !== pitch) {
			console.log('player\'s yaw/pitch isn\'t a float! they are hacking!')
			player.kick('Cheating :(')
		}
		let previousRawYaw = rawYaw
		let previousRawPitch = rawPitch
		rawYaw = yaw
		rawPitch = pitch

		// the player was teleported or something, ignore this tick
		if (positionReset) {
			positionReset = false
			return
		}

		const rawYawDifference = Math.abs(previousRawYaw - yaw)
		const rawPitchDifference = Math.abs(previousRawPitch - pitch)
		// if (rawYawDifference < lowestPossibleSensitivity && rawPitchDifference < lowestPossibleSensitivity) return console.log('probably in cinematic camera')

		if (previousRawYaw !== undefined) {

			// console.log('difference:', rawYawDifference, rawPitchDifference)
			if (certainAboutSensitivity) {
				if (
					isUnacceptableLook(rawYawDifference, sensitivity)
					|| isUnacceptableLook(rawPitchDifference, sensitivity)
				) {
					console.log('look direction is impossible!')
					return player.kick('Cheating :(')
				}
				// since we know the sensitivity, we can calculate how fast the player's mouse is going
				const mouseSpeed = Math.hypot(rawYawDifference, rawPitchDifference) / sensitivity
				const mouseAcceleration = mouseSpeed - previousMouseSpeed
				// console.log(mouseSpeed, rawYawDifference, rawPitchDifference)
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
				if (rawYawDifference !== 0)
					lookDifferences.add(rawYawDifference)
				if (rawPitchDifference !== 0)
					lookDifferences.add(rawPitchDifference)
				// console.log('aight so the sensitivity rn is', sensitivity)
				if (rawYawDifference && rawYawDifference < sensitivity)
					sensitivity = rawYawDifference
				if (rawPitchDifference && rawPitchDifference < sensitivity)
					sensitivity = rawPitchDifference

				const currentSensitivityIncorrectness = findNonMatchingSensitivities(sensitivity).length
				const yawModulo = calculateModuloForLook(rawYawDifference, sensitivity)
				const pitchModulo = calculateModuloForLook(rawPitchDifference, sensitivity)
				if (yawModulo > lowestPossibleSensitivity && yawModulo < sensitivity && findNonMatchingSensitivities(yawModulo).length < currentSensitivityIncorrectness) {
					console.log('epic, new sensitivity', yawModulo)
					sensitivity = yawModulo
				}
				if (pitchModulo > lowestPossibleSensitivity && pitchModulo < sensitivity && findNonMatchingSensitivities(pitchModulo).length < currentSensitivityIncorrectness) {
					console.log('epic, new sensitivity', pitchModulo)
					sensitivity = pitchModulo
				}


				function trySensitivity(s: number) {
					if (s === 0) return false // no
					for (const lookDifference of lookDifferences) {
						if (isUnacceptableLook(lookDifference, s))
							return false
					}
					return true
				}
			
				function findNonMatchingSensitivities(s: number, returnModulo?: boolean) {
					const nonMatchingSensitivities: number[] = []
					for (const lookDifference of lookDifferences) {
						const modulo = calculateModuloForLook(lookDifference, s)
						if (modulo > 0.00225 * s)
							nonMatchingSensitivities.push(returnModulo ? modulo : lookDifference)
					}
					return nonMatchingSensitivities
				}
				// console.log('lookDifferences', new Set(Array.from(lookDifferences).sort((a, b) => a - b)), sensitivity)
				if (lookDifferences.size >= 20) {
					// ok if we haven't figured out the sensitivity by then just assume they're cheating
					if (lookDifferences.size >= 100) {
						console.log('ok we couldn\'t figure out the sensitivity so just assume they\'re cheating', sensitivity)
						player.kick('Cheating :(')
					}
					// console.log('lookdifferences size is 20, now calculating sensitivity', lookDifferences)
					// console.log(lookDifferences)
					for (const lookDifference of lookDifferences) {
						for (const lookDifference2 of lookDifferences) {
							if (lookDifference - .009 <= lookDifference2) continue // lookDifference2 is always less than lookDifference
							const lookDifferenceDifference = lookDifference - lookDifference2
							if (lookDifferenceDifference < sensitivity) {
								sensitivity = lookDifferenceDifference
								const nonMatchingModulos = findNonMatchingSensitivities(sensitivity, true)
								if (nonMatchingModulos.length) console.log('failed finding look difference, trying to calculate it from known data', sensitivity, nonMatchingModulos)
								for (const nonMatchingModulo of nonMatchingModulos)
									if (nonMatchingModulo < sensitivity) {
										// console.log('nice! found better sensitivity', nonMatchingModulo, '<', sensitivity)
										if (findNonMatchingSensitivities(nonMatchingModulo).length < nonMatchingModulos.length)
											sensitivity = nonMatchingModulo
									}
							}
						}
					}
					if (sensitivity < lowestPossibleSensitivity) {
						console.log('player\'s sensitivity is too low', sensitivity)
						player.kick('Cheating :(')
					}
					if (sensitivity && trySensitivity(sensitivity)) {
						certainAboutSensitivity = true
						console.log('ok! calculated sensitivity to be', sensitivity, lookDifferences)
					}
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
  