---
name: coze-workflow-skill
description: Coze 工作流确定性能力（扫码登录 + 创建/读取/保存/试运行/验证工作流），agent 可自主引导用户扫码绑定账号后操作
---

# Coze Workflow Skill

操作私有 Coze 平台（coze.dev1.dachensky.com）工作流的确定性能力封装：
**用户扫码绑定自己的账号 → agent 直接执行工作流操作**（不需要用户复制任何 token/URL）。

## 何时使用

- 用户需要创建/修改/运行 Coze 工作流时
- 用户提到"coze 工作流"、"自动化流程"、"让 AI 建工作流"等
- 需要查询平台模型、读取/保存/试运行工作流时
- ⚠️ 本 skill **只做确定性操作**；"从需求规划工作流结构/生成 schema"属 LLM 编排层，由 agent 自己用 LLM 能力完成后再调本 skill 保存

## 快速开始

```bash
# 1. 检查登录态（没登录会提示）
node ./scripts/coze-cli.mjs status

# 2. 未登录 → 引导用户扫码（关键！）
node ./scripts/coze-login.mjs
```

## 扫码登录流程（agent 引导话术）

1. 运行 `coze-login.mjs`，**Mac 上会弹出浏览器窗口**（企业微信登录页）
2. 告诉用户："**请用企业微信 App 扫屏幕上弹窗里的二维码**"
3. 用户扫码确认后，脚本自动完成：跳转 → 提取 session → 存凭证
4. 脚本输出 `🎉 登录成功！凭证已保存` 即完成
5. 凭证存 `~/.coze/credentials.json`（含 session_key / user_id / space_id / expires_at）

⚠️ 铁律：
- 二维码**必须用有头浏览器窗口**展示（`agent-browser --headed` 已内置），终端字符画二维码扫不出
- 扫码后**用户不需要复制任何东西**，全程只扫一次码
- 凭证 24h 过期；过期后 `status`/操作会报 700012006 或提示过期，重新跑 `coze-login.mjs` 即可
- 每个用户独立凭证（覆盖式单用户；多用户隔离待后续版本）

## 命令参考（node coze-cli.mjs <cmd>）

| 命令 | 说明 |
|---|---|
| `status` | 登录态 + 探活（调模型列表） |
| `list [--space X]` | 列工作流（默认凭证 space） |
| `create <name> [desc] [--space X]` | 创建工作流 |
| `read <wfId> [--space X]` | 读 schema + submit_commit_id |
| `rename <wfId> <name> [desc]` | 重命名 |
| `delete <wfId>` | 删除工作流 |
| `test-run <wfId> '<json>'` | 试运行（返回 execute_id） |
| `save <wfId> <schema.json> [--space X]` | 保存 schema（自动拿编辑锁+最新 commit+validate_tree 校验） |
| `update <wfId> <ops.json> [--space X]` | **op 化编辑**（set/set_ref/rewrite_code，句柄式不用传完整 JSON） |
| `facts [--space X]` | 平台模型列表 |
| `login` | 快捷登录 |

## 空间（space）说明

- ⚠️ **创建前必须先让用户选空间**：运行 `coze spaces` 列可用空间，问用户放哪个，再用 `--space <id>` 指定
- 登录时自动把用户的 **Personal Space** 存进凭证（`space_id`）
- 工作流操作默认在该 space 进行；其他空间用 `--space <id>` 指定
- 用户能看到自己所属的所有空间（Personal/公共/团队空间，`coze spaces` 列出）
- 跨空间协作需要空间管理员邀请/授权（`/api/playground_api/space/*`）

## 数据库（知识库）能力（2026-08-17 实测）

| 命令 | 说明 |
|---|---|
| `coze spaces` | 可用空间列表（**创建前先跑这个**） |
| `coze db-create <name> <desc> [--fields 'json'] [--space X]` | 创建数据库（表名小写字母开头，仅小写字母数字下划线） |
| `coze db-upload <file.xlsx>` | 上传文件 → tos_uri |
| `coze db-schema <dbId> <tos_uri>` | 获取表结构 |
| `coze db-import <dbId> <tos_uri> [--wait]` | 校验+导入（--wait 轮询进度） |
| `coze db-list [--space X]` | 数据库列表 |

典型流程（导入歌曲库等知识数据）：
```bash
coze spaces                                        # 1. 看空间，用户选
coze db-create songs_lib "歌曲库" --space <id>      # 2. 建库（返回 database_id）
coze db-upload songs.xlsx                          # 3. 上传（返回 tos_uri）
coze db-import <database_id> <tos_uri> --wait      # 4. 导入（校验+提交+等进度）
```

## 创建工作流经验（重要，先读）

生成/编辑工作流 schema 前必读：**`docs/workflow-creation-guide.md`**
（节点类型/端口铁律/LLM 节点模板/database 条件/错误码速查/op 编辑）

**线上真实产物参考（最权威）：`assets/workflows/README.md` + 5 个生产工作流 JSON**
（线上导出，平台运行验证过：侧边栏点评 43 节点 / 健康食养 25 节点含数据库查询 / app_comment / custom_scene 含插件+循环 / image_comment 45 节点）
- 新节点类型：type9=子工作流、type4=插件、type21=循环（文档外，见 README）
- 大型工作流模式：判断树（type8 选择器）+ 子工作流（type9）+ 变量聚合（type32）

关键三条：
1. **LLM 节点复用平台已验证结构**（assets/workflows/*.json 提取或 read 已有工作流），手写必踩 720702089
2. **代码节点出边不写 sourcePortID**；LLM 节点出边 default+branch_error 成对
3. **database 节点 conditionList 不能为空**（op 编辑已支持条件透传保留）

## 平台事实（2026-08-17 实测）

- 认证：`Cookie: session_key=<JWT>` + `Agw-Js-Conv: str` + `x-requested-with: XMLHttpRequest`
- session_key：httpOnly cookie，JWT+HMAC 格式（base64url(payload)+签名无点分隔），24h 有效
- 25 个模型（Doubao-Seed-2.0-Lite / Deepseek-V4-Flash-VolcEngine / gemini-3.1-pro-preview / Qwen3.7-Plus 等，仅 6 个支持音频）
- 错误码：`700012006` = session 失效/缺失 → 重新登录；`777777759` = commit 过期（save 自动重试）；`777777770` = 资源变更通知失败（可重试）

## 关键实现细节

- 登录 URL 构造（与 coze 前端一致）：state = base64url(`?client_id=a1a27991a36f92d4f8d6&response_type=code&redirect_uri=<coze>/sign?redirect=%2F&scope=read&state=<随机数>&application=opencoze&provider=企业微信&method=signup`)
- 企业微信：appid `ww05e5424085f62d37`（数智化助手-测试），agentid `1000354`，回调 `sso.dev1.dachensky.com/callback`
- 登录检测：轮询浏览器 URL 跳到 `coze.dev1.dachensky.com` 后等 12s（SPA 完成 oauth_casdoor_code + 种 cookie），再取 session_key
- 保存流程：edit_lock → canvas(拿最新 submit_commit_id) → validate_tree → save（含 777777759/770 自动重试）

## 依赖

- `agent-browser`（npm i -g agent-browser && agent-browser install；已装 Chrome 152）
- Node 18+（fetch 原生）
- 不需要 Coze 平台任何 .env / 全局 session_key
- MCP 模式：npm install 一次（编译已内置 dist/coze-mcp.cjs 单文件，零依赖可直跑）

## MCP 模式（分享给其他 agent/同事用）

skill 内置标准 MCP server（stdio），7 个工具：

| 工具 | 说明 |
|---|---|
| `coze_create_workflow` | 创建空白工作流骨架 → workflow_id |
| `coze_save_workflow` | 保存（接受项目 CozeWorkflow 对象自动转换，或平台 schema 字符串） |
| `coze_test_run` | 试运行 → execute_id |
| `coze_list_workflows` | 工作流列表（cursor 分页） |
| `coze_update_meta` | 更新名称/描述 |
| `coze_get_schema` | 读 schema + commit |
| `coze_convert_schema` | 项目格式 → 平台格式（纯本地） |

### 启动

```bash
cd coze-workflow-skill && npm run build   # 首次：编译单文件（esbuild 已内置 sdk+zod）
npm run mcp                              # 启动 stdio MCP server
```

### 接入 Claude Desktop / Cursor / Qoder（示例）

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

⚠️ 首次使用前必须扫码登录（生成 ~/.coze/credentials.json）：`node scripts/coze-login.mjs`

## 分享给其他人（无 agent-coze-workflow 项目）

skill 完全自包含（agent-coze-workflow 的确定性能力已移植进来）：

```
coze-workflow-skill/
├── SKILL.md
├── package.json          # deps: mcp sdk + zod；dev: tsx/esbuild/typescript
├── src/                  # TS 源码（coze-client / schema-converter / mcp-server / types）
├── dist/coze-mcp.cjs     # 预编译 MCP 单文件（零依赖，node 直跑）
└── scripts/
    ├── coze-login.mjs    # 扫码登录（零依赖）
    └── coze-cli.mjs      # CLI 确定性操作（零依赖）
```

对方需要：Node 18+；`npm install`（仅 MCP 模式需要，CLI/登录零依赖）；首次扫码登录。

## 边界（不做的事）

- 不做 LLM 规划/生成 schema（那是 agent 自己的推理职责；`coze_convert_schema` 负责把 agent 生成的项目格式转成平台格式）
- 不做多用户凭证并行管理（单凭证覆盖）
- 不做工作流执行结果轮询（test-run 只返回 execute_id；结果查询用 `GET /api/workflow_api/get_process?workflow_id=&execute_id=&space_id=&need_async=true`）

## 工作流 schema 实战经验（2026-08-17 歌名→音频→歌词 端到端）

参考模板：
- `examples/song-lyrics-workflow.json`（数据库查询 + 代码提取 + 多模态 LLM 识别歌词，平台实测运行成功）
- `examples/batch-llm-node.json`（**批处理 LLM 节点**：28 天批量生成，真实生产节点，含完整 prompt + 校验链）
- `examples/batch-validator-node.json`（**批处理校验代码节点**：LLM 输出校验+截断修复+兜底检测+序号覆盖，标配链）

- **LLM 节点必须复用平台验证过的结构**（examples 模板或从平台 read 已有工作流提取）：手写 LLM 节点即使对照文档也会踩 `720702089 schema conversion failed`（inputs/outputs/settingOnError 的隐含字段组合校验）。已验证结构：settingOnError switch+dataOnErr+processType:3+ext.backupLLmParam；outputs 含 reasoning_content/errorBody(errorMessage+errorCode readonly)/isSuccess readonly
- **代码节点出边不写 sourcePortID**（BranchBuilder 铁律）；LLM 节点出边 default+branch_error 成对
- **数据库节点（type 43）**：conditionList 不能为空数组（报 left clause required），至少一个条件 [left, operation, right]；databaseInfoID = library_resource_list(res_type=7) 的 res_id（= memory/database/list 的 id）
- **多模态音频输入**：LLM inputParameters 用 type:string 直接引用音频 URL（{{audio_url}}），模型选 audio_understanding=true（Doubao-Seed-2.0-Lite）
- **批处理 LLM 节点**（type3 + batch）：`examples/batch-llm-node.json`，一次性对上游列表每个元素并发调 LLM 后汇总列表输出。关键：batch.inputLists 引用上游列表 + inputParameters 中批处理项 source 指向自身节点 ID + outputs 为 list 类型 + 校验节点紧跟做兜底检测/序号覆盖。详见 `docs/workflow-creation-guide.md` §3.2
- 端到端：start(song) → db(43, song EQUAL) → code(5, 取 outputList[0].url) → llm(3, 多模态) → end(lyrics)，实测映山红/花非花歌词识别正确
