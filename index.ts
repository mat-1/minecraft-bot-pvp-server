import createMCServer from './server/index'
import * as WorldConstructor from 'prismarine-world'
import { Anvil as AnvilConstructor } from 'prismarine-provider-anvil'

const serv = createMCServer({
	'motd': 'matdoes.dev\npvp',
	'port': 25565,
	'max-players': 1000,
	'online-mode': false,
	'logging': true,
	'gameMode': 2,
	'difficulty': 1,
	'generation': {
	  'name': 'void',
	  'options': {}
	},
	'kickTimeout': 10000,
	'plugins': {
  
	},
	'modpe': false,
	'view-distance': 10,
	'player-list-text': {
	  'header': {'text': ''},
	  'footer': {'text': ''}
	},
	'everybody-op': true,
	'version': '1.16.4'
})

interface gameServerOptions {
	knockbackMultiplier: number
}

interface gameServer {
	world,
	options: gameServerOptions
}

serv.gameServers = []
// serv.gameServers: gameServer[] = []

const Anvil = AnvilConstructor(serv._server.version)
const World = WorldConstructor(serv._server.version)

serv.hub = new World(null, new Anvil('./worlds/hub'))



