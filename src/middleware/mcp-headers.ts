import type { Context, Next } from 'hono';

const PROTOCOL_VERSION = '2026-07-28';

export function mcpHeaderValidation() {
  return async (c: Context, next: Next) => {
    if (c.req.method !== 'POST') {
      return next();
    }

    const protocolVersion = c.req.header('MCP-Protocol-Version');
    if (protocolVersion !== PROTOCOL_VERSION) {
      return c.json(
        {
          error: 'Unsupported or missing MCP-Protocol-Version header',
          expected: PROTOCOL_VERSION,
          received: protocolVersion ?? null,
        },
        400,
      );
    }

    const mcpMethod = c.req.header('Mcp-Method');
    if (!mcpMethod) {
      return c.json(
        {
          error: 'Missing required header: Mcp-Method',
        },
        400,
      );
    }

    const mcpName = c.req.header('Mcp-Name');
    if (!mcpName) {
      return c.json(
        {
          error: 'Missing required header: Mcp-Name',
        },
        400,
      );
    }

    return next();
  };
}

export { PROTOCOL_VERSION };
