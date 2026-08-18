#!/usr/bin/env node
/** 循环节点最小测试：start → loop(blocks:[code]) → end */
import { writeFileSync } from "node:fs";
const schema = {
  versions: { loop: "v2" },
  nodes: [
    { id: "100001", type: "1", meta: { position: { x: 0, y: 0 } }, data: { nodeMeta: { title: "开始", icon: "", description: "", mainColor: "#52c41a", subTitle: "" }, outputs: [{ type: "integer", name: "n", required: true }], trigger_parameters: [] } },
    { id: "200101", type: "21", meta: { position: { x: 300, y: 0 } }, data: { nodeMeta: { title: "循环3次", icon: "", description: "", mainColor: "#00B2B2", subTitle: "循环" }, inputs: { loopType: "count", loopCount: { type: "integer", value: { type: "literal", content: 3, rawMeta: { type: 2 } } }, variableParameters: [], inputParameters: [] }, outputs: [{ name: "result_list", input: { type: "list", schema: { type: "string" }, value: { type: "ref", content: { source: "block-output", blockID: "200201", name: "result" }, rawMeta: { type: 1 } } } }] },
    { id: "900001", type: "2", meta: { position: { x: 600, y: 0 } }, data: { nodeMeta: { title: "结束", icon: "", description: "", mainColor: "#faad14", subTitle: "" }, inputs: { terminatePlan: "returnVariables", inputParameters: [{ name: "out", input: { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "200101", name: "result_list" } } } }] }, outputs: [] } },
  ],
  edges: [
    { sourceNodeID: "100001", targetNodeID: "200101" },
    { sourceNodeID: "200101", targetNodeID: "900001", sourcePortID: "loop-output" },
  ],
};
// blocks 挂到循环节点顶层（与 data 平级，真实产物结构）
const loop = schema.nodes.find((n) => n.type === "21");
loop.blocks = [
  { id: "200201", type: "5", meta: { position: { x: -200, y: 0 } }, data: { nodeMeta: { title: "循环体", icon: "", description: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { inputParameters: [], code: 'async def main(args: Args) -> Output:\n    return {"result": "第" + str(getattr(args, "loop_index", 1)) + "次"}', language: 3, settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 } }, outputs: [{ type: "string", name: "result" }], version: "5" } },
];
writeFileSync("/tmp/coze-probe/loop-test.json", JSON.stringify(schema, null, 2));
console.log("循环测试 schema 已生成");
