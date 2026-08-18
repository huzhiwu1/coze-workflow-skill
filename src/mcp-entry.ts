/**
 * MCP 入口 —— stdio 模式启动 Coze MCP Server
 *
 * 用法：
 *   npm run mcp:dev     # 开发（tsx）
 *   npm run build && npm run mcp   # 生产（esbuild 单文件）
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCozeMcpServer } from "./mcp-server";

async function main() {
  const server = createCozeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[coze-mcp] Coze MCP Server 已启动（stdio）");
}

main().catch((e) => {
  console.error("[coze-mcp] 启动失败:", e.message);
  process.exit(1);
});
