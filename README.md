# Coze Workflow Skill

让 AI 助手（Claude、Cursor、Qoder、OpenClaw 等）直接操作 Coze 工作流和数据库。

**一句话：扫码登录 → agent 自己创建工作流、改节点、试运行、查数据库，全程不需要你复制任何 token。**

## 快速开始（3 分钟）

```bash
# 1. 克隆
git clone https://github.com/YOUR_GITHUB_USER/coze-workflow-skill.git
cd coze-workflow-skill

# 2. 配置平台连接信息（联系管理员获取）
cp .env.example .env
# 编辑 .env 填入你的 COZE_ORIGIN / COZE_SSO_ORIGIN / COZE_CLIENT_ID / COZE_WECOM_APPID / COZE_WECOM_AGENTID
source .env

# 3. 扫码登录（弹浏览器窗口，企业微信扫码，只需一次）
node scripts/coze-login.mjs
# 凭证自动存 ~/.coze/credentials.json（24h 有效，过期重跑即可）

# 4. 验证
node scripts/coze-cli.mjs status
# ✅ 已登录（有效期至 ...）
```

## 三种使用方式

### 方式一：CLI（人类用，零依赖）

```bash
node scripts/coze-cli.mjs spaces                      # 看有哪些空间
node scripts/coze-cli.mjs list --space <id>           # 列工作流
node scripts/coze-cli.mjs run <wfId> '{"input":"x"}'  # 运行工作流并等结果
node scripts/coze-cli.mjs db-list --space <id>        # 列数据库

# 全部命令：
node scripts/coze-cli.mjs
```

19 个命令：login / status / spaces / list / create / read / rename / delete / test-run / run / save / update / publish / facts / db-create / db-upload / db-schema / db-import / db-list / db-delete

### 方式二：MCP Server（AI 助手用，最推荐）

把你的 AI 编程助手（Claude Desktop / Cursor / Qoder / Codex）接入 Coze 平台：

**1. 构建（首次）**
```bash
npm install && npm run build
```

**2. 配置 AI 助手**

在 Claude Desktop / Cursor / Qoder 的 MCP 配置中加入：

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

**3. Agent 可调用的 7 个工具**

| 工具 | 说明 |
|---|---|
| `coze_create_workflow` | 创建空白工作流 |
| `coze_save_workflow` | 保存工作流（自动拿锁+校验+commit） |
| `coze_test_run` | 试运行 |
| `coze_list_workflows` | 工作流列表（cursor 分页） |
| `coze_update_meta` | 更新名称/描述 |
| `coze_get_schema` | 读取 schema + commit |
| `coze_convert_schema` | 项目格式 → 平台格式（纯本地转换） |

Agent 拿到这些工具后就能自主：创建 → 编辑 → 校验 → 保存 → 试运行，全程闭环。

⚠️ **首次使用前**：需要手动扫码登录一次（`node scripts/coze-login.mjs`），后续 agent 自动读 `~/.coze/credentials.json`。

### 方式三：OpenClaw Skill（OpenClaw 用户）

把 `coze-workflow-skill/` 放到 OpenClaw 的 skills 目录，agent 自动读 SKILL.md 学会所有操作。

## 前置条件

| 依赖 | 说明 |
|---|---|
| Node.js 18+ | 原生 fetch，零额外依赖 |
| agent-browser | 仅登录需要：`npm i -g agent-browser && agent-browser install` |
| 企业微信 | 扫码登录（需要账号被加入企业应用） |
| npm install | 仅 MCP 模式需要 |

## 能力概览

- **工作流全生命周期**：创建 / 读取 / 保存（自动拿锁+校验+commit）/ 试运行 / 运行+轮询结果 / 重命名 / 删除 / 发布 / op 化编辑
- **数据库**：创建 / 上传 Excel / 校验 schema / 导入 / 列表 / 删除
- **空间**：列出可用空间，操作时 `--space <id>` 指定
- **节点支持**：13 种节点类型全通（start / end / LLM / code / condition / 子工作流 / HTTP / 文本处理 / 数据库查询 / 注释 / 延迟定时器 / 变量聚合 / 输出）
- **凭证隔离**：每个用户独立 `~/.coze/credentials.json`，互不影响

## 文件结构

```
coze-workflow-skill/
├── README.md                 # 本文件
├── SKILL.md                  # OpenClaw Skill 规范（agent 自动读取）
├── SHARING.md                # 分享给其他人的详细指引
├── .env.example              # 平台连接配置模板
├── package.json              # MCP 模式依赖（sdk + zod）
├── scripts/
│   ├── coze-login.mjs        # 扫码登录（零依赖）
│   └── coze-cli.mjs          # CLI 确定性操作（零依赖）
├── src/                      # TS 源码（coze-client / schema-converter / mcp-server）
├── dist/
│   ├── coze-mcp.cjs          # 预编译 MCP 单文件（零依赖直跑）
│   └── coze-update.cjs       # op 化编辑单文件
├── docs/
│   └── workflow-creation-guide.md  # 创建工作流经验手册
├── examples/                 # 工作流 JSON 模板（song-lyrics / quote-analyzer / ai-copy-factory / batch-llm）
└── assets/workflows/         # 线上真实工作流参考（5 个生产工作流）
```

## 权限说明

- 登录的是**用户自己的账号**，操作**自己可见的空间**
- 每个用户独立凭证，互不影响
- 数据库/工作流的增删改查都在用户有权限的空间内

## 常见问题

- **登录报 appid 错误**：agent-browser daemon 残留，先 `agent-browser close --all`
- **session 过期**：操作报 700012006 → 重新 `node scripts/coze-login.mjs`
- **创建工作流报 720702089**：LLM 节点结构问题，参考 `examples/` 或 `assets/workflows/` 的真实模板
- **MCP 连不上**：确认已扫码登录（`~/.coze/credentials.json` 存在）且环境变量已设置