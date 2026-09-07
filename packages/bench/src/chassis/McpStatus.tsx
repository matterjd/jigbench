import type { ShopInfo } from '@jigbench/core';
import './McpStatus.css';

export interface McpStatusProps {
  shop: ShopInfo | null;
}

/** "MCP — the secondary door" (AMENDMENT-1 A1): Build runs Claude Code itself now, so MCP is
 * only for other agents (and Claude Desktop, which cannot build) — confined to Advanced, never
 * on the default view. */
export function McpStatus({ shop }: McpStatusProps) {
  return (
    <div className="jig-mcp-status">
      <div className="jig-mcp-status__row">
        <span className={'jig-mcp-status__chip' + (shop ? ' jig-mcp-status__chip--connected' : '')}>
          <span className="jig-mcp-status__dot" aria-hidden="true" />
          {shop ? `connected · ${shop.client}` : 'none connected'}
        </span>
      </div>
      <p className="jig-mcp-status__say">
        <b>Build</b> runs Claude Code itself in the clamped repo; MCP stays for other agents. <span>.mcp.json</span> written.
      </p>
    </div>
  );
}
