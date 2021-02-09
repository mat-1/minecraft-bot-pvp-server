import { Physics, PlayerState } from 'prismarine-physics'
import * as mcDataInitializer from 'minecraft-data'
import { Vec3 } from 'vec3'


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


module.exports.player = function (player, serv, { version }) {
	const mcData = mcDataInitializer(version)

	player.state = {
		vel: new Vec3(0, 0, 0)
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
				console.log('player is hacking!!!', position, potentialSimulationPositions)
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

	player._client.on('position', ({ x, y, z, onGround }: any = {}) => {
		return
		player.state.onGround = onGround
		positionUpdate(new Vec3(x, y, z))
	})
	
	player._client.on('position_look', ({ x, y, z, onGround, yaw, pitch }: any = {}) => {
		return
		player.state.yaw = (-yaw + 180) * Math.PI / 180
		player.state.pitch = pitch * Math.PI / 180
		player.state.onGround = onGround
		positionUpdate(new Vec3(x, y, z))
	})

	player._client.on('look', ({ yaw, pitch }: any = {}) => {
		return
		player.state.yaw = (-yaw + 180) * Math.PI / 180
		player.state.pitch = pitch * Math.PI / 180
	})
}
  