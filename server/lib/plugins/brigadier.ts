import { CommandDispatcher, literal, argument, string, Suggestions, CommandNode, RootCommandNode, LiteralCommandNode, ArgumentCommandNode } from 'node-brigadier'
import * as requireIndex from '../requireindex'
import { MCServer } from '../..'
import * as path from 'path'

const plugins = requireIndex(path.join(__dirname, '..', 'plugins'))

module.exports.server = (serv: MCServer) => {
	const dispatcher = new CommandDispatcher()
	serv.brigadier = dispatcher

	serv.on('asap', () => {
		Object.keys(plugins)
		.filter(pluginName => plugins[pluginName].brigadier !== undefined)
		.forEach(pluginName => plugins[pluginName].brigadier(dispatcher, serv, { literal, argument, string, Suggestions }))
	})
}

// not sure what this method does, copied from minecraft source
function makeNodeMap(rootCommandNode) {
	const commandNodes = []
	const queue = [];
	queue.push(rootCommandNode)
	let commandNode
	while (queue.length > 0) {
		commandNode = queue.shift()
		if (commandNodes.includes(commandNode))
			continue
		commandNodes.push(commandNode)
		for (const nodeChild of commandNode.getChildren())
			queue.push(nodeChild)
		if (commandNode.getRedirect() == null)
			continue
		queue.push(commandNode.getRedirect())
	}
	return commandNodes
}

interface JsonNode {
	flags?: NodeFlags
	children?: number[]
	redirectNode?: number
	extraNodeData?: null | string | {
		name?: string
		parser?: string
		properties?: null | {
			flags: number
			min: number
			max: number
		},
		suggests?: string[]
	}
}

interface NodeFlags {
	unused: boolean,
	has_custom_suggestions: boolean,
	has_redirect_node: boolean,
	has_command: boolean,
	command_node_type: number,
}

module.exports.player = (player, serv: MCServer) => {
	const root = serv.brigadier.getRoot()
	const commandNodes = makeNodeMap(root)
	console.log(commandNodes)
	const jsonCommandNodes = []
	for (const nodeInt in commandNodes) {
		const node = commandNodes[nodeInt]
		const jsonNode: JsonNode = {}
		const flags: NodeFlags = {
			unused: false,
			has_custom_suggestions: false,
			has_redirect_node: false,
			has_command: false,
			command_node_type: 0,
		}
		if (node.redirect) {
			flags.has_redirect_node = true
			jsonNode.redirectNode = commandNodes.indexOf(node.redirectNode)
		}
		if (node.command) flags.has_command = true
		if (node instanceof RootCommandNode) {
			flags.command_node_type = 0
		} else if (node instanceof LiteralCommandNode) {
			flags.command_node_type = 1
			// @ts-expect-error
			jsonNode.extraNodeData = node.literal
		} else if (node instanceof ArgumentCommandNode) {
			flags.command_node_type = 2
			// @ts-expect-error
			if (node.args.size > 0)
				flags.has_custom_suggestions = true
				jsonNode.extraNodeData = {

				}
		}
		jsonNode.flags = flags
		const children = []
		for (const [_, childNode] of node.children) {
			children.push(commandNodes.indexOf(childNode))
		}
		jsonNode.children = children
		jsonCommandNodes.push(jsonNode)
	}
	console.log(jsonCommandNodes)
	player._client.write('declare_commands', {
		nodes: jsonCommandNodes,
		rootIndex: commandNodes.indexOf(root)
	})

	player.handleCommand = async(str) => {
		const parsedCommand = serv.brigadier.parse(str, {
			player: player
		})
		try {
			serv.brigadier.execute(parsedCommand)
		} catch (ex) {
			console.error(ex.getMessage())
		}
	}


}