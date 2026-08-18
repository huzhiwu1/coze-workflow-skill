# 创建工作流经验手册（来自 agent-coze-workflow 实战）

> 本手册沉淀 agent-coze-workflow 项目 8 天实战经验（源码 + 平台样本 + 试错），
> 生成工作流 schema 前必读。节点平台格式见 `src/schema-converter.ts`（正向转换）
> 与 `src/platform-to-project.ts`（反转换）。

## 一、节点类型（数字 type 映射）

| 数字 | 类型 | 要点 |
|---|---|---|
| 1 | start | outputs = inputVariables（多输入）；trigger_parameters 需与 outputs 一致（不能空数组） |
| 2 | end | inputs.inputParameters 的 ref 指向上游输出（"nodeId.outputName"） |
| 3 | LLM | **必须复用平台验证过的节点结构**（见第三节）；出边 default + branch_error 成对；支持批处理（batch） |
| 5 | code | **出边不写 sourcePortID**（BranchBuilder 铁律）；language: 3（Python）；outputs 要声明；常接在批处理 LLM 后做校验 |
| 8 | condition | 出边 true/false 成对（sourcePortID: "true"/"false"） |
| 43 | database_query | conditionList **不能为空**（见第四节）；databaseInfoID = 库的 res_id |
| 45 | http | apiInfo + body/auth/setting + outputs body/statusCode/headers |
| 15 | text | allArrayItemConcatChars 等字段 |

## 二、端口铁律（边 sourcePortID）

- **代码节点（5）出边不写 sourcePortID** ← 最易踩，报 BranchBuilder 错误
- **LLM 节点（3）出边必须 default + branch_error 成对**（配合 settingOnError.switch）
- **condition（8）出边 true/false 成对**
- start/database/http 等节点出边不带端口

## 三、LLM 节点（最重要经验）

⚠️ **手写 LLM 节点必踩 `720702089 schema conversion failed`**——即使对照文档逐字段一致。
**解法：从平台 `coze read <wfId>` 拉一个已成功运行的工作流，提取其 LLM 节点复用**（改 id/输入引用/prompt 即可）。
skill 参考模板：
- `examples/song-lyrics-workflow.json`（单次 LLM：数据库+代码+LLM 全套，实测运行成功）
- `examples/batch-llm-node.json`（批处理 LLM：28 天批量生成，真实生产节点）

### 3.1 单次 LLM 节点（标准结构）

已验证可用的 LLM 节点结构：
- inputs.llmParam 14 项（temperature/maxTokens/topP/responseFormat/modleName/modelType/generationDiversity/supportThinking/enableThinking/apiType/prompt/enableChatHistory/chatHistoryRound/systemPrompt）
- settingOnError：switch:true + dataOnErr(业务输出 JSON 字符串) + processType:3 + timeoutMs:120000 + retryTimes:1 + ext.backupLLmParam(JSON 字符串)
- outputs：业务输出 + reasoning_content(string) + errorBody(object, schema:[errorMessage, errorCode] readonly) + isSuccess(boolean readonly)
- 多模态输入（图片样本）：type:"list" + schema{type:string, assistType:2} + rawMeta{type:104, isVision:true}
- 音频输入实测：inputParameters 用 type:"string" 直接引用音频 URL 即可，模型选 audio_understanding=true（Doubao-Seed-2.0-Lite）

### 3.2 批处理 LLM 节点（type3 + batch，2026-08-18 来自健康食养生产工作流）

批处理 LLM 是一次性对上游列表的每个元素分别调用 LLM，并发执行后汇总列表输出。

**核心结构**：节点 data 里多一个 `"batch"` 对象，在 `inputs` 同级：

```json
{
  "type": "3",
  "data": {
    "nodeMeta": { "title": "生成28天单日食谱", ... },
    "inputs": {
      "inputParameters": [
        // 1. 普通引用参数（上游输出，每个批处理项共用）
        { "name": "profile_json", "input": { "type": "object", "value": { "type": "ref", "content": { "source": "block-output", "blockID": "200101", "name": "profile_json" } } } },
        // 2. 批处理项参数（从 inputLists 注入，每个批处理项不同）
        { "name": "item1", "input": { "type": "object", "value": { "type": "ref", "content": { "source": "block-output", "blockID": "200104A", "name": "item1" } } } }
      ],
      "llmParam": [ /* 14 项标准 LLM 参数，prompt 中用 {{item1}} 引用批处理项 */ ],
      "batch": {
        "batchEnable": true,
        "batchSize": 28,
        "concurrentSize": 8,
        "inputLists": [
          {
            "name": "item1",
            "input": {
              "type": "list",
              "schema": { "type": "object", "schema": [] },
              "value": {
                "type": "ref",
                "content": { "source": "block-output", "blockID": "200201", "name": "outputList" },
                "rawMeta": { "type": 103 }
              }
            }
          }
        ]
      },
      "settingOnError": {
        "switch": true,
        "dataOnErr": "{ ... 兜底 JSON ... }",
        "processType": 1,
        "timeoutMs": 600000,
        "singleTimeoutMs": 90000,
        "retryTimes": 1,
        "ext": { "backupLLmParam": "{ ... 备用模型参数 ... }" }
      }
    },
    "outputs": [
      {
        "type": "list",
        "name": "outputList",
        "schema": {
          "type": "object",
          "schema": [
            { "type": "integer", "name": "day_no" },
            { "type": "string", "name": "dayLabel" },
            { "type": "object", "name": "meals", "schema": [ /* 子字段 */ ] },
            { "type": "list", "name": "usedIngredients", "schema": { "type": "string" } },
            { "type": "list", "name": "adjustmentNotes", "schema": { "type": "string" } },
            { "type": "object", "name": "errorBody", "schema": [
              { "type": "string", "name": "errorMessage", "readonly": true },
              { "type": "string", "name": "errorCode", "readonly": true }
            ], "readonly": true },
            { "type": "boolean", "name": "isSuccess", "readonly": true }
          ]
        }
      }
    ],
    "version": "3"
  }
}
```

**关键字段说明**：

| 字段 | 说明 |
|---|---|
| `batch.batchEnable` | 必须 `true` |
| `batch.batchSize` | 总批次数（上游列表长度） |
| `batch.concurrentSize` | 并发数（建议 4-8，过高会触发 API 429） |
| `batch.inputLists[].name` | 批处理项变量名，与 inputParameters 中同名项的 `name` 对应 |
| `batch.inputLists[].value` | 上游列表引用（`rawMeta.type:103` 表示列表类型引用） |
| `inputParameters 中的 item1` | 引用 `source: "block-output", blockID: "<自身节点ID>", name: "item1"`——**批处理项的 source 指向自身节点 ID，不是上游** |
| `settingOnError.processType` | **1** = 单失败项容错（失败项走兜底，其余继续）；3 = 整体失败（一个失败全部挂） |
| `settingOnError.singleTimeoutMs` | 单次 LLM 调用超时（ms），配合 `timeoutMs` 总预算 |
| `outputs[0].type` | 必须是 `"list"`（批处理输出是列表），不是 `"object"` |
| `outputs[0].schema` | 列表中每个元素的 schema（与单次 LLM 输出结构一致） |
| `prompt 中引用` | 用 `{{item1}}` 引用当前批处理项（或 `{{item1.field}}` 如果 item 是对象） |

**⚠️ 批处理 LLM 铁律**：
1. **inputParameters 中批处理项的 source 指向自身**（`blockID: "<自身节点ID>"`），非上游——这是平台内部约定，跟普通 ref 不同
2. **outputs 必须是 list 类型**，不是 object——上游校验节点（如 code type5）的 inputParameters 也声明为 `type: "list"` 来承接
3. **并发数不要太高**：DeepSeek API 有并发限制，建议 4-8，遇到 429 降到 4
4. **兜底 JSON 必须与正常输出结构一致**：`dataOnErr` 里的字段名/类型与 outputs.schema 对齐，否则校验节点可能误判失败
5. **prompt 中必须要求输出 JSON**：批处理 + responseFormat:2（JSON 严格模式）+ prompt 硬性要求输出 JSON 对象
6. **校验节点紧跟 LLM**：批处理有概率个别项失败，必须用 code 节点校验（去 Markdown 围栏/检测兜底标记/isSuccess 判定/强制序号覆盖）

**真实参考模板**：`examples/batch-llm-node.json`（健康食养 28 天食谱生成节点，含完整 prompt + 系统提示词 + 分人群替换规则）

### 3.3 批处理 LLM 校验代码节点（标配链）

批处理 LLM 有概率个别项失败（LLM 幻觉/截断/兜底），**必须紧跟一个 code 校验节点**（type5）。
参考模板：`examples/batch-validator-node.json`（健康食养 200105，平台实测）。

**校验节点必须做的事**（按优先级）：

| 步骤 | 说明 | 代码要点 |
|---|---|---|
| 1. 兼容输入类型 | 上游可能传 list 或 JSON 字符串 | `isinstance(output_list, str)` → `json.loads` |
| 2. 清洗 Markdown 围栏 | LLM 可能输出 ` ```json ... ``` ` | `strip("`")` + `text.find("{")` 截取 |
| 3. 修复截断 JSON | LLM 输出被 maxTokens 截断 | 正则找最后一个完整 `"key": "value"`，补 `usedIngredients/notes` 闭合 |
| 4. 检测兜底标记 | 失败项走 dataOnErr 兜底 | 搜 `"生成失败"` / `"默认兜底"` / `isSuccess=false` |
| 5. 强制序号覆盖 | 不信 LLM 输出的 day_no | `day_no = index + 1`（批处理顺序编号） |
| 6. 校验必填字段 | 餐次不能为空 | `REQUIRED_MEALS = ["MORNING","BREAKFAST","LUNCH","DINNER"]` |
| 7. 输出结构 | 汇总 valid/failed/errors | `status, valid_days, failed_days, errors, is_success, debug_logs` |

**校验节点 schema 声明**：

```json
{
  "type": "5",
  "data": {
    "nodeMeta": { "title": "校验单日食谱", "subTitle": "代码" },
    "inputs": {
      "inputParameters": [
        {
          "name": "outputList",
          "input": {
            "type": "list",
            "schema": { "type": "object", "schema": [
              { "type": "integer", "name": "day_no" },
              { "type": "string", "name": "dayLabel" },
              { "type": "object", "name": "meals", "schema": [ /* MORNING/BREAKFAST/LUNCH/DINNER */ ] },
              { "type": "list", "name": "usedIngredients", "schema": { "type": "string" } },
              { "type": "list", "name": "adjustmentNotes", "schema": { "type": "string" } },
              { "type": "object", "name": "errorBody", "schema": [ /* errorMessage, errorCode */ ], "readonly": true },
              { "type": "boolean", "name": "isSuccess", "readonly": true }
            ] },
            "value": { "type": "ref", "content": { "source": "block-output", "blockID": "200104A", "name": "outputList" } }
          }
        }
      ],
      "code": "...",
      "language": 3
    },
    "outputs": [
      { "type": "string", "name": "status" },
      { "type": "object", "name": "valid_days", "schema": [] },
      { "type": "string", "name": "failed_days" },
      { "type": "object", "name": "errors", "schema": [] },
      { "type": "string", "name": "completed_days" },
      { "type": "string", "name": "total_days" },
      { "type": "boolean", "name": "is_success" },
      { "type": "object", "name": "debug_logs", "schema": [] }
    ]
  }
}
```

**⚠️ 校验代码铁律**：
1. **inputParameters 用 `type: "list"` 承接**，不是 `"object"`——批处理输出是列表
2. **兼容字符串输入**：Coze 可能把上游 list 序列化为 JSON 字符串传入，先 `isinstance(str)` 再 `json.loads`
3. **language 必须为 3**（Python）
4. **debug_logs 输出是救命稻草**：记录每一步的 item_type/item_keys/raw_preview，批处理失败时靠它定位哪项出问题
5. **截断 JSON 修复用正则**：`r'"([A-Z]+)"\s*:\s*"([^"]*)"'` 找最后一个完整 key-value，补后续字段闭合
6. **兜底 JSON 的字段名必须与正常输出一致**（见 §3.2 铁律 4），否则校验节点检测不到兜底

## 四、database_query 节点

- databaseInfoID = `coze db-list` 的 id（= library_resource_list res_type=7 的 res_id = memory/database/list 的 id）
- **conditionList 不能为空数组**（`[[]]` 执行报 `left clause required`）；至少一个条件组 [left, operation, right]：
  ```json
  [{"name":"left","input":{"type":"string","value":{"type":"literal","content":"song"}}},
   {"name":"operation","input":{"type":"string","value":{"type":"literal","content":"EQUAL"}}},
   {"name":"right","input":{"type":"string","value":{"type":"ref","content":{"source":"block-output","blockID":"100001","name":"song"}}}}]
  ```
- outputs：outputList(list, schema object) + rowNum(integer)
- ⚠️ **op 编辑必须保留条件**：反转换把 selectParam 存入节点 `_temp.externalData.platformRaw.selectParam`，schema-converter 已支持恢复（2026-08-18 修复）。但**旧版 schema-converter 重建空条件会破坏查询**——升级后重新保存即可恢复

## 五、创建流程建议（agent 视角）

1. `coze spaces` → 用户选空间 → 记 spaceId
2. `coze facts` → 确认模型/节点类型
3. LLM 生成**项目格式**工作流（见 schema-converter 的项目格式约定）→ `coze save`
   - 或直接用平台格式（复用已验证节点模板）
4. `coze run <wfId> '<input>'` → 试运行+轮询结果
5. 迭代修改：**用 op 编辑**（不重新传大 JSON）：
   ```
   coze update <wfId> ops.json
   # ops: [{"op":"set","target":"节点title","field":"userPrompt","value":"新提示"}]
   ```

## 六、常见错误码速查

| code | 含义 | 处理 |
|---|---|---|
| 700012006 | session 失效/缺失 | 重新 `coze login` |
| 720701013 | 执行失败（left clause required / invalid port 等） | 查 database condition / 端口铁律 |
| 720702089 | schema conversion failed | LLM 节点结构问题 → 复用平台已验证节点 |
| 720702002 | 缺必填输入参数 | 检查 start 输入变量与 run 传参 |
| 777777759 | commit 过期（保存竞态） | save 自动重试（已内置） |
| 777777770 | 资源变更通知失败 | 可重试（已内置） |
| 106000001 | creator_id 无效（数据库） | 用 account/info/v2 的 user_id_str |
| 106000000 | 字段数不匹配（数据库导入） | 库字段必须与文件列一一对应 |

## 六·补、condition / merge 实战经验（2026-08-18 全节点验证）

- **condition（type8）用 operator 7（字符串等于）**：`{"operator":7,"left":{ref},"right":{literal}}`，left+right 成对。⚠️ operator 11（布尔判断）运行时卡住（executeStatus=1 无进展）——布尔判断改用 code 输出 "yes"/"no" 字符串 + operator 7
- condition 出边：branches 数组每个分支一个 true 端口（true, true_1, true_2...）+ 一个 false（否则）
- **merge（type32）**：mergeGroups[{name:"Group1", variables:[ref...]}] + outputs[{type:string, name:"Group1"}]；入边无端口；真实产物里 merge 聚合**错误处理/分支输出**节点
- ⚠️ **LLM 节点直连 merge 会 conversion failed**（720702089）——真实产物里 LLM 从不直连 merge；LLM 出边只到 end/condition（已验证）；要聚合 LLM 输出请加中间代码节点或直接 LLM→end
- **end 多输入可行**：inputParameters 数组可引用不同来源（如 interpret=llm.output + original=code.quote），运行时按分支各自赋值
- 变量名与数据库字段名同名（如 category）已验证无冲突
- 完整全节点模板：`examples/quote-analyzer-workflow.json`（start 双输入→db→code→condition→llm→end 双输出，平台实测运行成功）

## 七、op 编辑（JSON 过大问题的解法）

句柄式编辑：**只传 workflowId + 操作数组**，不传完整 JSON。
- `set`：改白名单字段（config.model/userPrompt/systemPrompt/code/language/branches/outputs/outputVariables/inputVariables/data）
- `set_ref`：改 end 节点输出引用（outputName + ref）
- `rewrite_code`：重写代码节点（**skill 版传 code 字段直写**，不走 LLM 生成）
- 流程自动：拉最新 schema → 反转换 → 逐条执行 → 转回平台 → 保存（stale 检测天然满足）

## 八、12 节点大型工作流实战（2026-08-18 AI 文案工厂，全通）

模板：`examples/ai-copy-factory-workflow.json`（ai_copy_factory_v2，平台运行验证）
覆盖：start / end / LLM×2 / code / condition / **type9 子工作流** / **type15 文本处理** / **type31 注释** / **type40 变量赋值** / database_query / **type58 JSON序列化** / **type59 JSON反序列化**

### 新验证的节点结构
- **type9 子工作流**：workflowId + spaceId + **workflowVersion 用发布版本号**（先 `coze publish <子工作流Id> --version v0.0.1` 发布；未发布报 720702004，留空/"latest" 均无效）+ inputDefs + type:0 + inputParameters；outputs [{type:"object", name:"output"}]
- **type15 文本处理**：method:"concat" + inputParameters[{name:"String1", ref}] + concatParams[concatResult("{{String1}}")/arrayItemConcatChar/allArrayItemConcatChars(换行)]；**不是** text/outputName 结构
- **type31 注释**：孤立节点（不连边），data.inputs 为空
- **type40 变量赋值**：assignments[{variable, value}] + outputs；⚠️ 其他节点引用其输出会运行报错（key=xxx）——**不要引用 40 的输出**，仅作初始化
- **type58/59（⚠️ 前端不识别，勿用于 UI 可打开的工作流）**：API save/run 通过，但平台前端 `Unknown NodeMeta by type 59/58`（getNodeTemplateInfoByType 失败）→ 工作流在画布打不开。**只能用于纯 API 场景；要 UI 可打开必须移除**。AI 文案工厂已移除 58/59（改 45→15 直连）
- **子工作流调用**：type9 → code 承接（object→string）→ 下游

### 方法论（重要）
**从已验证基线增量构建**：每加一个新节点类型，从上一个成功 schema 增量添加并 run 验证。
手写全新多节点 schema 极易 conversion failed 且难定位（本实验 v8~v13 连续失败，
最终从 v16 成功基线逐步加 9/15/31/40/58/59 全部通过）。

### type45 HTTP 节点（2026-08-18 验证 ✅）
```json
{"type":"45","data":{"inputs":{
  "apiInfo":{"method":"GET","url":"https://..."},
  "body":{"bodyType":"EMPTY","bodyData":{"binary":{"fileURL":{"type":"string","value":{"type":"ref","content":{"source":"block-output","blockID":"","name":""}}}}}},
  "headers":[],"params":[],
  "auth":{"authType":"BEARER_AUTH","authData":{"customData":{"addTo":"header"}},"authOpen":false},
  "setting":{"timeout":30,"retryTimes":1}
},"outputs":[{"type":"string","name":"body"},{"type":"integer","name":"statusCode"},{"type":"string","name":"headers"}]}}
```
URL 变量引用：`{{block_output_<blockID>.<name>}}` 完整格式（配 inputParameters 映射）。

### 循环（21）空间级限制（定案）
- 结构已确认：blocks 数组（循环体）+ 循环节点顶层 edges（`loop-function-inline-output` 入口边）+ outputs 引用 blocks 内节点 + 配套 type19/29（无 inputs/outputs）+ **_temp 非必需**
- **测试全记录**：手写×4 / 原样复制×1 / 剪贴板完整版（含 _temp）×1 / 发布后×1 / 换模型×1——全部 `108000001 权限校验未通过`
- **根因：空间级限制**——线上工作流在空间 `7594778999100801024`（生产），兴趣岛ma 空间（7560621359533916160）**未开通循环功能**；非构造/模型问题
- 解法：平台在目标空间开通循环，或用有权限的空间

### 其他未攻克
- **type1001 延迟定时器 ✅**（2026-08-18 用户提供真实结构）：`inputs.timerParam = {duration:0, delay_duration:{type:"literal",content:1,rawMeta:{type:2}}, mode:"delay", duration_unit:"m", timer_format:""}`——duration_unit m=分钟/s=秒；运行延迟生效（1 分钟延迟实测 62s）
- type13 输出：服务端 go panic（结构未对）
