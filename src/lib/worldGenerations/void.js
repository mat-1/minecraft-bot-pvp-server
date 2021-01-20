function generation (options = {}) {
  const Chunk = require('prismarine-chunk')(options.version)

  function generateChunk () {
    return new Chunk()
  }
  return generateChunk
}

module.exports = generation
