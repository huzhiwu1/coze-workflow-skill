#!/usr/bin/env node
/**
 * 生成主工作流：AI 营销文案工厂（全节点测试）
 * start → 注释 → 变量赋值 → LLM(生成JSON) → JSON反序列化 → 数据库查询 → 代码(合并)
 * → 选择器(素材充足?) → 子工作流(生成文案) → 文本处理 → JSON序列化 → 输出 → end
 */
import { writeFileSync, readFileSync } from "node:fs";

const DB_ID = "YOUR_DATABASE_ID"; // quotes_lib
const SUB_WF_ID = "YOUR_SUB_WORKFLOW_ID"; // copywriter_sub
const good = JSON.parse(readFileSync("/tmp/coze-probe/known-good-llm.json", "utf8"));

function ref(name, type, blockID, refName, rawType = 1) {
  return { name, input: { type, value: { type: "ref", content: { source: "block-output", blockID, name: refName }, rawMeta: { type: rawType } } } };
}
function lit(name, type, content, rawType) {
  return { name, input: { type, value: { type: "literal", content, rawMeta: { type: rawType } } } };
}

// LLM1：生成结构化初稿（JSON 输出）
const llm1 = JSON.parse(JSON.stringify(good));
llm1.id = "200102";
llm1.meta = { position: { x: 500, y: 0 } };
llm1.data.nodeMeta.title = "初稿生成";
llm1.data.inputs.inputParameters = [ref("topic", "string", "100001", "topic")];
for (const p of llm1.data.inputs.llmParam) {
  if (p.name === "prompt") p.input.value.content = '你是营销文案专家。根据主题「{{topic}}」生成初稿，严格输出 JSON：{"title":"标题","content":"正文"}';
  if (p.name === "responseFormat") p.input.value.content = "2";
}

// LLM2：重新生成（选择器 false 分支）
const llm2 = JSON.parse(JSON.stringify(good));
llm2.id = "200108";
llm2.meta = { position: { x: 1400, y: 0 } };
llm2.data.nodeMeta.title = "补充生成";
llm2.data.inputs.inputParameters = [ref("topic", "string", "100001", "topic")];
for (const p of llm2.data.inputs.llmParam) {
  if (p.name === "prompt") p.input.value.content = '主题「{{topic}}」缺少素材，请直接生成一条完整文案。';
}

const schema = {
  versions: { loop: "v2" },
  nodes: [
    // 1 开始（双输入）
    { id: "100001", type: "1", meta: { position: { x: 0, y: 0 } }, data: { nodeMeta: { title: "开始", icon: "", description: "主题+平台", mainColor: "#52c41a", subTitle: "" }, outputs: [{ type: "string", name: "topic", required: true }, { type: "string", name: "platform", required: false }], trigger_parameters: [] } },
    // 31 注释（孤立）
    { id: "200100", type: "31", meta: { position: { x: -400, y: 100 } }, data: { nodeMeta: { title: "注释", icon: "", description: "AI 营销文案工厂：多节点全链路测试", mainColor: "#8c8c8c", subTitle: "" }, inputs: {} } },
    // 40 变量赋值
    { id: "200101", type: "40", meta: { position: { x: 250, y: 0 } }, data: { nodeMeta: { title: "初始化", icon: "", description: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { assignments: [{ variable: "draft", value: { type: "literal", content: "{}" } }] }, outputs: [{ type: "string", name: "draft" }] } },
    llm1,
    // 59 JSON反序列化
    { id: "200103", type: "59", meta: { position: { x: 750, y: 0 } }, data: { nodeMeta: { title: "解析初稿", icon: "", description: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { inputParameters: [ref("input", "string", "200102", "output")] }, outputs: [{ type: "object", name: "output", schema: [] }] } },
    // 43 数据库查询
    { id: "200104", type: "43", meta: { position: { x: 1000, y: 0 } }, data: { nodeMeta: { title: "查素材", icon: "", description: "", mainColor: "#eb2f96", subTitle: "" }, inputs: { databaseInfoList: [{ databaseInfoID: DB_ID }], selectParam: { condition: { conditionList: [[{ name: "left", input: { type: "string", value: { type: "literal", content: "category" } } }, { name: "operation", input: { type: "string", value: { type: "literal", content: "EQUAL" } }, { name: "right", input: { type: "string", value: { type: "literal", content: "励志", rawMeta: { type: 1 } } } }]], logic: "AND" }, orderByList: [], limit: 10 }, settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 } }, outputs: [{ type: "list", name: "outputList", schema: { type: "object", schema: [] } }, { type: "integer", name: "rowNum" }], version: "43" } },
    // 5 代码（合并素材）
    { id: "200105", type: "5", meta: { position: { x: 1250, y: 0 } }, data: { nodeMeta: { title: "合并素材", icon: "", description: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { inputParameters: [ref("outputList", "list", "200104", "outputList", 103), ref("draft_json", "string", "200102", "output")], code: "async def main(args: Args) -> Output:\n    output_list = args.params.get(\"outputList\") or []\n    draft = args.params.get(\"draft_json\") or \"{}\"\n    material = \"\"\n    if isinstance(output_list, list) and len(output_list) > 0:\n        first = output_list[0] if isinstance(output_list[0], dict) else {}\n        material = str(first.get(\"text\", \"\"))\n    has_material = \"yes\" if material else \"no\"\n    return {\"combined\": draft + \"|\" + material, \"material\": material, \"has_material\": has_material}", language: 3, settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 } }, outputs: [{ type: "string", name: "combined" }, { type: "string", name: "material" }, { type: "string", name: "has_material" }], version: "5" } },
    // 8 选择器（素材是否充足）
    { id: "200106", type: "8", meta: { position: { x: 1550, y: 0 } }, data: { nodeMeta: { title: "素材是否充足", icon: "", description: "", mainColor: "#00B2B2", subTitle: "选择器" }, inputs: { branches: [{ condition: { logic: 2, conditions: [{ operator: 7, left: { input: { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "200105", name: "has_material" } } } }, right: { input: { type: "string", value: { type: "literal", content: "yes", rawMeta: { type: 1 } } } } }] } }] } },
    llm2,
    // 9 子工作流
    { id: "200107", type: "9", meta: { position: { x: 1700, y: 0 } }, data: { nodeMeta: { title: "文案生成子流程", icon: "", description: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { workflowId: SUB_WF_ID, spaceId: "YOUR_SPACE_ID", workflowVersion: "latest", inputDefs: [{ name: "material", type: "string", required: true }], inputParameters: [ref("material", "string", "200105", "material")], settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 } } } },
    // 15 文本处理
    { id: "200109", type: "15", meta: { position: { x: 1900, y: 0 } }, data: { nodeMeta: { title: "格式化", icon: "", description: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { inputParameters: [ref("text", "string", "200107", "output")], text: "【AI生成】{{text}}", outputName: "formatted", settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 } }, outputs: [{ type: "string", name: "formatted" }], version: "15" } },
    // 58 JSON序列化
    { id: "200110", type: "58", meta: { position: { x: 2100, y: 0 } }, data: { nodeMeta: { title: "结果序列化", icon: "", description: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { inputParameters: [ref("input", "string", "200109", "formatted")] }, outputs: [{ type: "string", name: "output" }] } },
    // 13 输出（中间输出）
    { id: "200111", type: "13", meta: { position: { x: 2300, y: 0 } }, data: { nodeMeta: { title: "中间输出", icon: "", description: "", mainColor: "#52c41a", subTitle: "" }, inputs: { inputParameters: [ref("msg", "string", "200110", "output")] }, outputs: [{ type: "string", name: "output" }] } },
    // 2 结束
    { id: "900001", type: "2", meta: { position: { x: 2500, y: 0 } }, data: { nodeMeta: { title: "结束", icon: "", description: "", mainColor: "#faad14", subTitle: "" }, inputs: { terminatePlan: "returnVariables", inputParameters: [{ name: "result", input: { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "200110", name: "output" } } } }] }, outputs: [] } },
  ],
  edges: [
    { sourceNodeID: "100001", targetNodeID: "200101" },
    { sourceNodeID: "200101", targetNodeID: "200102" },
    { sourceNodeID: "200102", targetNodeID: "200103", sourcePortID: "default" },
    { sourceNodeID: "200102", targetNodeID: "900001", sourcePortID: "branch_error" },
    { sourceNodeID: "200103", targetNodeID: "200104" },
    { sourceNodeID: "200104", targetNodeID: "200105" },
    { sourceNodeID: "200105", targetNodeID: "200106" },
    { sourceNodeID: "200106", targetNodeID: "200107", sourcePortID: "true" },
    { sourceNodeID: "200106", targetNodeID: "200108", sourcePortID: "false" },
    { sourceNodeID: "200108", targetNodeID: "200109", sourcePortID: "default" },
    { sourceNodeID: "200108", targetNodeID: "900001", sourcePortID: "branch_error" },
    { sourceNodeID: "200107", targetNodeID: "200109" },
    { sourceNodeID: "200109", targetNodeID: "200110" },
    { sourceNodeID: "200110", targetNodeID: "200111" },
    { sourceNodeID: "200111", targetNodeID: "900001" },
  ],
};

writeFileSync("/tmp/coze-probe/master-wf.json", JSON.stringify(schema, null, 2));
console.log("✅ 主工作流生成（12 节点类型：1/2/3/5/8/9/13/15/31/40/43/58/59）");
console.log("   LLM×2 / 子工作流 / 选择器 / JSON序列化反序列化 / 变量赋值 / 注释 / 输出");
