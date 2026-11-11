// Tiny stdio MCP server used by tests: one tool with a "messy" JSON schema, as real servers have.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'echo', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list-events',
      description: 'List calendar events',
      inputSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
        properties: { day: { type: 'string', default: 'today' }, limit: { type: 'integer' } },
        required: ['day'],
      },
    },
    { name: 'boom', description: 'Always fails', inputSchema: { type: 'object' } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'boom') return { isError: true, content: [{ type: 'text', text: 'it broke' }] };
  return { content: [{ type: 'text', text: `events for ${req.params.arguments?.day}: standup at 09:30` }] };
});

await server.connect(new StdioServerTransport());
