const { entity } = require('./spawn')
import * as Hjson from 'hjson'
import * as path from 'path'
import { MCEntity, MCPlayer } from '../..'
const fs = require('fs')

module.exports.server = function (serv) {
	let ticking = false
	serv.on('tick', function (delta) {
		// if (ticking || delta > 1) { return }
		ticking = true
		Promise.all(
			Object.keys(serv.entities).map(async (id) => {
				const entity = serv.entities[id]
				if (entity.deathTime && Date.now() - entity.bornTime >= entity.deathTime) {
					entity.destroy()
					return
				} else if (entity.pickupTime && Date.now() - entity.bornTime >= entity.pickupTime) {
					const players = serv.getNearby({
						world: entity.world,
						position: entity.position,
						radius: 1.5 // Seems good for now
					})
					if (players.length) {
						players[0].collect(entity)
					}
				}
				// TODO: re-add mob physics
				// if (!entity.velocity || !entity.size) return
				// const posAndOnGround = await entity.calculatePhysics(delta)
				// if (entity.type === 'mob') entity.sendPosition(posAndOnGround.position, posAndOnGround.onGround)
				entity.tick()
				entity.emit('tick')
			})
		)
			.then(() => { ticking = false })
			.catch((err) => setTimeout(() => { throw err }, 0))
	})
}

enum MetadataTypes {
	byte,
	varint,
	float,
	string,
	chat,
	optchat,
	slot,
	boolean,
	rotation,
	position,
	optposition,
	direction,
	optuuid,
	optblockid,
	nbt,
	particle,
	villager,
	optvarint,
	pose,
}

export enum Pose {
	STANDING,
	FALL_FLYING,
	SLEEPING,
	SWIMMING,
	SPIN_ATTACK,
	SNEAKING,
	DYING
}

function readJsonFile(dir: string): any {
	return Hjson.parse(
		fs.readFileSync(
			path.join(__dirname, dir),
			'utf8'
		)
	)
}

const Metadata: {[ key: string ]: { key: number, type: MetadataTypes}[]} = readJsonFile('../../../data/entity_metadata.json')
const MetadataEntityParents: {[ key: string ]: string[]} = readJsonFile('../../../data/entity_parents.json')
const MetadataNames: {
	[ key: string ]: {
		[ key: string ]:
			string | ({ [ key: string ]: string })
	}
} = readJsonFile('../../../data/metadata_names.json')

function getRelevantPackets(entity: MCEntity) {
	const entityNames = MetadataEntityParents[entity.type]
	const relevantPackets: {
		key: number,
		type: MetadataTypes,
		name: string | ({ [ key: string ]: string })
	}[] = []
	for (const entityName of entityNames) {
		for (let packet of Metadata[entityName]) {
			const packetWithName = {
				key: packet.key,
				type: packet.type,
				name: MetadataNames[entityName][packet.key]
			}
			relevantPackets.push(packetWithName)
		}
	}
	return relevantPackets
}

export interface MetadataPacket {
	key: number,
	type: number,
	value: any,
}

module.exports.entity = (entity: MCEntity) => {
	entity.metadata = {
		crouching: false,
		sprinting: false,
	}
	entity.createMetadataPacket = (metadata?: { [key: string]: any }): MetadataPacket[] => {
		if (!metadata) metadata = entity.metadata
		if (!metadata) return
		const metadataPacket = []
		const relevantPackets = getRelevantPackets(entity)
		for (const packet of relevantPackets) {
			let packetValue
			if (packet.name instanceof Object) {
				// bit mask packet
				packetValue = 0
				let isChanged = false
				for (const bitwiseNumber in packet.name) {
					const bitwiseName: string = packet.name[bitwiseNumber]
					const bitwiseValue: boolean | undefined = metadata[bitwiseName]
					if (metadata[bitwiseName] !== undefined)
						isChanged = true
					if (bitwiseValue)
						packetValue |= parseInt(bitwiseNumber)
				}
				if (!isChanged) continue
			} else if (metadata[packet.name] !== undefined) {
				// normal packet
				packetValue = metadata[packet.name]
			} else {
				continue
			}
			metadataPacket.push({
				key: packet.key,
				type: packet.type,
				value: packetValue,
			})
		}
		return metadataPacket
	}

	entity.sendMetadata = (metadata: { [key: string]: any }, targetPlayer?: MCPlayer): void => {
		const packet = {
			entityId: entity.id,
			metadata: entity.createMetadataPacket(metadata)
		}
		if (targetPlayer)
			targetPlayer._client.write('entity_metadata', packet)
		else
			entity._writeNearby('entity_metadata', packet)
	}

	entity.setAndUpdateMetadata = (metadata: { [key: string]: any }, targetPlayer?: MCPlayer): void => {
		Object.apply(entity.metadata, metadata)
		if (targetPlayer)
			entity.sendMetadata(metadata, targetPlayer)
		else
			entity.sendMetadata(metadata)
	}
}
