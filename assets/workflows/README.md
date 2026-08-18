# 线上真实工作流参考（assets/workflows）

> 来源：线上生产工作流导出（2026-08-18），**全部在平台运行验证过**。
> 生成新工作流时优先对照这些真实产物结构——比文档可靠（文档可能过时）。
> 每个文件都是标准平台 schema（nodes + edges，已去除 _temp 画布噪音）。

## 文件清单

| 文件 | 节点/边 | 类型分布 | 用途 |
|---|---|---|---|
| 侧边栏点评.json | 43/64 | type8×8, type5×12, type3×11, **type9×9**, type32 | 大型点评工作流：品类判断 → 多路分支（健康食养/营养/单图/多图/问卷/PDF/视频/音频/太极点评）→ 子工作流聚合 |
| 健康食养.json | 25/30 | type5×10, type3×5, type8×3, type15×3, **type43×1**, type32 | 28 天食谱生成：问卷结构化 → 数据库查询基础食谱 → 排序 → 失败天局部重生成 → 合并复检（含 3 个文本处理/校验分支） |
| app_comment_new.json | 22/41 | type9×6, type5×5, type3×4, type8×4 | 点评子工作流聚合器（音视频/问卷/PDF/图片点评全走子工作流） |
| custom_scene.json | 25/36 | type5×9, type15×4, **type4×4**, type3×2, **type21×1** | 自定义场景：gemini 视频/图片点评（插件）+ 循环节点 + seedream 生图 |
| image_comment_new.json | 45/64 | type3×16, type5×12, type8×10, type15×2, type4×1, type32×2 | 图片点评：单图/多图/构图/倒影/主体背景分析/场景识别/截图识别/润色（最复杂的视觉工作流） |

## 新节点类型（文档外，真实产物确认）

| 类型 | 名称 | 结构要点 | 参考文件 |
|---|---|---|---|
| **type 9** | 子工作流 | `inputs: {workflowId, spaceId, workflowVersion, inputDefs[], inputParameters, settingOnError}` | 侧边栏点评.json |
| **type 4** | 插件 | `inputs: {apiParam: [{name:"apiID", input:{value:{type:"literal", content:"<plugin_api_id>"}}}]}`（apiID = 已发布插件的 API ID，如 gemini 点评） | custom_scene.json |
| **type 21** | 循环 | `inputs: {loopType:"count", loopCount, ...}` | custom_scene.json |

## 对照要点

- **type8 选择器**：出边 true/false 成对（sourcePortID），多分支用 选择器_1/选择器_2 命名
- **type5 代码节点**：出边无 sourcePortID；语言 3=Python；批量/校验逻辑都放代码节点
- **type3 LLM**：11-16 个 LLM 节点的大型工作流没问题——每个 LLM 节点结构相同（复用平台模板）
- **type32 变量聚合**：多分支汇聚（merge），inputParameters 引用各分支输出
- **健康食养.json 的 type43**：数据库查询节点在真实生产工作流中的用法（查询 28 天基础食谱 + 排序 + 重生成）
- **健康食养.json 的 batch LLM**：**批处理 LLM 节点**（type3 + batch），28 天批量生成 → code 校验链，已提取为 `examples/batch-llm-node.json`，详见 `docs/workflow-creation-guide.md` §3.2
- 子工作流（type9）是大型工作流的**模块化手段**：侧边栏点评把 9 个点评子流程拆成独立工作流再聚合

## 用途

1. **生成参考**：agent 创建相似工作流时，对照真实产物的节点/边/端口结构
2. **结构学习**：大型工作流的组织模式（判断树 + 子工作流 + 变量聚合）
3. **LLM 节点模板**：从这些文件提取 LLM 节点（已验证结构），避免手写踩 720702089

## 注意

assets/workflows/ 中的 Space ID、Workflow ID、Database ID、Plugin ID 已替换为占位符（如 `YOUR_SPACE_ID`、`YOUR_DATABASE_ID`）。使用前需替换为你的平台实际 ID。