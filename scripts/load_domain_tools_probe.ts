import { DOMAIN_TOOLS } from '../src/agent/domainTools'

async function main() {
  const tool = DOMAIN_TOOLS.find((entry) => entry.name === 'current_local_time')
  if (!tool) throw new Error('current_local_time not found')
  console.log(JSON.stringify({ name: tool.name, args: tool.args, result: await tool.handler({}) }, null, 2))
}

void main()
