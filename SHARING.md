# 如何让其他人使用 coze-workflow-skill

> 目标用户：没有 agent-coze-workflow 项目、没有 OpenClaw 环境的开发者/同事。
> 只需 Node 18+，一次扫码，即可操作 Coze 工作流和数据库。

平台连接信息已内置（私有化部署），**使用者零配置，直接扫码登录即可**。

## 方式一：CLI（推荐人类用户）

```bash
# 1. 获取 skill
git clone https://github.com/YOUR_GITHUB_USER/coze-workflow-skill.git
cd coze-workflow-skill

# 2. 首次登录（会弹浏览器窗口，企业微信扫码，只需扫一次）
node scripts/coze-login.mjs
#   凭证自动存 ~/.coze/credentials.json（24h 有效，过期重跑本命令）

# 3. 日常使用
node scripts/coze-cli.mjs spaces                    # 看有哪些空间
node scripts/coze-cli.mjs list --space <id>         # 列工作流
node scripts/coze-cli.mjs run <wfId> '{"input":"x"}' # 运行工作流并等结果
node scripts/coze-cli.mjs db-list --space <id>      # 列数据库
# 全部命令：node scripts/coze-cli.mjs（无参数看帮助）
```

## 方式二：MCP（推荐 AI 编程助手/agent 用户）

给 Claude Desktop / Cursor / Qoder / Codex 配置：

```json
{
  "mcpServers": {
    "coze": {
      "command": "node",
      "args": ["/绝对路径/coze-workflow-skill/dist/coze-mcp.cjs"]
    }
  }
}
```

- 7 个工具：coze_create_workflow / coze_save_workflow / coze_test_run / coze_list_workflows / coze_update_meta / coze_get_schema / coze_convert_schema
- agent 自主调用；首次使用前需手动扫码登录一次（`node scripts/coze-login.mjs`）

## 方式三：作为 OpenClaw Skill（AI agent 自主使用）

把 `coze-workflow-skill/` 放到 OpenClaw 的 skills 目录，
agent 读 SKILL.md 自动学会：扫码引导 → 空间选择 → 工作流/数据库全操作。

## 前置条件

| 依赖 | 说明 |
|---|---|
| Node.js 18+ | CLI/登录零依赖，MCP 用打包好的单文件 |
| agent-browser | 仅登录需要：`npm i -g agent-browser && agent-browser install`（自动装 Chrome） |
| 企业微信 | 扫码登录企业应用（需要账号被加入该企业） |
| npm install | 仅 MCP 模式需要（skill 仓库内一次安装，构建 dist） |

## 权限说明

- 登录的是**用户自己的账号**，操作**自己可见的空间**（Personal/公共/团队空间）
- 每个用户独立凭证（~/.coze/credentials.json），互不影响
- 数据库/工作流的增删改查都在用户有权限的空间内

## 常见问题

- **登录报 appid 错误**：agent-browser daemon 残留，先 `agent-browser close --all` 再重试
- **session 过期**：操作报 700012006 → 重新 `node scripts/coze-login.mjs`
- **看不到窗口**：确认脚本带 --headed（v1.1+ 已内置）
- **创建工作流报 720702089**：LLM 节点结构问题，参考 examples/ 或 assets/workflows/ 的真实模板