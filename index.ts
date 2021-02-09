import createMCServer from './server/index'
import * as WorldConstructor from 'prismarine-world'
import { Anvil as AnvilConstructor } from 'prismarine-provider-anvil'


function HSVtoRGB(h, s, v) {
	// https://axonflux.com/handy-rgb-to-hsl-and-rgb-to-hsv-color-model-c
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return '#'
		+ Math.round(r * 255).toString(16)
		+ Math.round(g * 255).toString(16)
		+ Math.round(b * 255).toString(16)
}

function makeMotd(clientProtocol, serverProtocol, serverVersion) {
	if (clientProtocol < serverProtocol) {
		return [
			{
				text: `Please use Minecraft `,
				color: 'red'
			},
			{
				text: serverVersion + '+',
				color: 'green'
			},
			{
				text: ' to play on matdoes.dev',
				color: 'red'
			}
		]
	}
	const serverNameColor = HSVtoRGB(Date.now() / 60000 % 1, .5, 1)
	return [
		{
			text: ' '.repeat(22)
		},
		{
			text: 'matdoes',
			color: serverNameColor,
		},
		{
			text: '.',
			color: '#696969', // nice
		},
		{
			text: 'dev',
			color: serverNameColor,
		},
		{
			text: '\n'
		},
		{
			text: ' '.repeat(27)
		},
		{
			text: 'PVP',
			color: '#ff0000',
			bold: true
		}
	]
}

function makePingResponse(response, client, answerToPing) {
	const serverProtocol = serv._server.mcversion.version
	const serverVersion = serv._server.mcversion.minecraftVersion
	const clientProtocol = client.protocolVersion
	const motd = makeMotd(clientProtocol, serverProtocol, serverVersion)
	const pingResponse = {
		version: {
			name: serverVersion,
			protocol: serverProtocol
		},
		players: {
			max: serv._server.maxPlayers,
			online: serv._server.playerCount,
			sample: []
		},
		description: motd,
		favicon: serv._server.favicon
	}
	client.write('server_info', {
		response: JSON.stringify(pingResponse)
	})
}

const serv = createMCServer({
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
	'version': '1.16.4',
	beforePing: makePingResponse
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



