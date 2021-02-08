import * as requireIndex from './requireindex'
import * as path from 'path'

const defaultPlugins = requireIndex(path.join(__dirname, '../lib', 'plugins'))
const userPlugins = requireIndex(path.join(__dirname, '../', 'plugins'))

export default {
	...defaultPlugins,
	...userPlugins
}