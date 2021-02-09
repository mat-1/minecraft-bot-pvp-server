import { MCPlayer } from '../..'
import { Pose } from './entities'

module.exports.player = function (player: MCPlayer) {
	player._client.on('arm_animation', () =>
		player._writeOthersNearby('animation', {
			entityId: player.id,
			animation: 0
		})
	)

	player._client.on('entity_action', ({ actionId }) => {
		switch (actionId) {
			case 0:
				// start sneaking
				player.setAndUpdateMetadata({
					crouching: true,
					pose: Pose.SNEAKING
				})
				break
			case 1:
				// stop sneaking
				player.setAndUpdateMetadata({
					crouching: false,
					pose: Pose.STANDING
				})
				break
			case 2:
				// leave bed
				break
			case 3:
				// sprinting
				player.setAndUpdateMetadata({
					sprinting: true
				})
				break
			case 4:
				player.setAndUpdateMetadata({
					sprinting: false
				})
				break
			case 5:
				// start jump with horse
				break
			case 6:
				// stop jump with horse
				break
			case 7:
				// open horse inventory
				break
			case 8:
				// start flying with elytra
				break
		}
	})
}
