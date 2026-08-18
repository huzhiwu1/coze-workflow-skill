#!/usr/bin/env node
/**
 * 批量验证新节点类型：start → X → end，save+run 看结果
 * 用法: node probe-node.mjs <type> <wfId>
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const cred = JSON.parse(readFileSync(path.join(homedir(), ".coze/credentials.json"), "utf8"));
const spaceIdx = process.argv.indexOf("--space");
const SPACE = spaceIdx >= 0 ? process.argv[spaceIdx + 1] : cred.space_id;

async function call(api, body, prefix = "/api/workflow_api/") {
  const res = await fetch(`${cred.origin}${prefix}${api}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_key=${cred.session_key}`,
      "Agw-Js-Conv": "str",
      "x-requested-with": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 各类型节点构造（data.inputs 的候选结构，逐个试）
const candidates = {
  "31": [ // 注释（孤立节点，不连边）
    { data: { nodeMeta: { title: "注释", description: "这是注释", icon: "", mainColor: "#8c8c8c", subTitle: "" }, inputs: {} }, isolated: true },
  ],
  "13": [ // 输出
    { data: { nodeMeta: { title: "输出", description: "中间输出", icon: "", mainColor: "#52c41a", subTitle: "" }, inputs: { inputParameters: [{ name: "msg", input: { type: "string", value: { type: "literal", content: "中间消息", rawMeta: { type: 1 } } } }] }, outputs: [{ type: "string", name: "output" }] } },
  ],
  "40": [ // 变量赋值
    { data: { nodeMeta: { title: "变量赋值", description: "", icon: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { assignments: [{ variable: "v1", value: { type: "literal", content: "hello" } }] }, outputs: [{ type: "string", name: "v1" }] } },
  ],
  "58": [ // JSON 序列化
    { data: { nodeMeta: { title: "JSON序列化", description: "", icon: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { inputParameters: [{ name: "input", input: { type: "string", value: { type: "literal", content: '{"a":1}', rawMeta: { type: 1 } } } }] }, outputs: [{ type: "string", name: "output" }] } },
  ],
  "59": [ // JSON 反序列化
    { data: { nodeMeta: { title: "JSON反序列化", description: "", icon: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { inputParameters: [{ name: "input", input: { type: "string", value: { type: "literal", content: '{"a":1}', rawMeta: { type: 1 } } } }] }, outputs: [{ type: "string", name: "output" }] } },
  ],
  "45": [ // HTTP
    { data: { nodeMeta: { title: "HTTP", description: "", icon: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { apiInfo: { method: "GET", url: "https://httpbin.org/get" }, body: { bodyType: "EMPTY", bodyData: { binary: { fileURL: { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "", name: "" } } } } } }, headers: [], params: [], auth: { authType: "BEARER_AUTH", authData: { customData: { addTo: "header" } }, authOpen: false }, setting: { timeout: 30, retryTimes: 1 } }, outputs: [{ type: "string", name: "body" }, { type: "integer", name: "statusCode" }, { type: "string", name: "headers" }] } },
  ],
  "1001": [ // 延迟定时器
    { data: { nodeMeta: { title: "延迟", description: "", icon: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { delayTime: { type: "integer", value: { type: "literal", content: "1", rawMeta: { type: 2 } } } }, outputs: [] } },
    { data: { nodeMeta: { title: "延迟", description: "", icon: "", mainColor: "#00B2B2", subTitle: "" }, inputs: { delaySeconds: { type: "integer", value: { type: "literal", content: "1", rawMeta: { type: 2 } } } }, outputs: [] } },
  ],
  "42": [ // 更新数据
    { data: { nodeMeta: { title: "更新数据", description: "", icon: "", mainColor: "#eb2f96", subTitle: "" }, inputs: { databaseInfoList: [{ databaseInfoID: "YOUR_DATABASE_ID" }], selectParam: { condition: { conditionList: [[{ "name": "left", "input": { "type": "string", "value": { "type": "literal", "content": "category" } } }, { "name": "operation", "input": { "type": "string", "value": { "type": "literal", "content": "EQUAL" } } }, { "name": "right", "input": { "type": "string", "value": { "type": "literal", "content": "励志", "rawMeta": { "type": 1 } } } } ]], "logic": 2 }, orderByList: [], limit: 1 }, updateParam: { fieldList: [{ "name": "author", "input": { "type": "string", "value": { "type": "literal", "content": "更新测试", "rawMeta": { "type": 1 } } } } ] }, settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 } }, outputs: [{ type: "integer", name: "updateNum" }] } },
    { data: { nodeMeta: { title: "更新数据", description: "", icon: "", mainColor: "#eb2f96", subTitle: "" }, inputs: { databaseInfoList: [{ databaseInfoID: "YOUR_DATABASE_ID" }], selectParam: { condition: { conditionList: [[{ "name": "left", "input": { "type": "string", "value": { "type": "literal", "content": "category" } } }, { "name": "operation", "input": { "type": "string", "value": { "type": "literal", "content": "EQUAL" } } }, { "name": "right", "input": { "type": "string", "value": { "type": "literal", "content": "励志", "rawMeta": { "type": 1 } } } } ]], "logic": "AND" }, orderByList: [], limit: 1 }, updateParam: { fieldList: [{ "name": "author", "input": { "type": "string", "value": { "type": "literal", "content": "更新测试", "rawMeta": { "type": 1 } } } } ] }, settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 } }, outputs: [{ type: "integer", name: "updateNum" }] } },
  ],
  "13": [ // 输出（中间输出）
    { data: { nodeMeta: { title: "输出", description: "", icon: "", mainColor: "#52c41a", subTitle: "" }, inputs: { inputParameters: [{ name: "output", input: { type: "string", value: { type: "literal", content: "中间消息", rawMeta: { type: 1 } } } }] }, outputs: [] } },
  ],
};

async function main() {
  const type = process.argv[2];
  const wfId = process.argv[3];
  if (!type || !wfId) { console.error("用法: probe-node.mjs <type> <wfId>"); process.exit(1); }
  const cands = candidates[type];
  if (!cands) { console.error(`无 ${type} 的候选结构`); process.exit(1); }

  for (let i = 0; i < cands.length; i++) {
    const node = cands[i];
    node.id = "200101";
    node.type = type;
    node.meta = { position: { x: 300, y: 0 } };
    const schema = {
      versions: { loop: "v2" },
      nodes: [
        { id: "100001", type: "1", meta: { position: { x: 0, y: 0 } }, data: { nodeMeta: { title: "开始", icon: "", description: "", mainColor: "#52c41a", subTitle: "" }, outputs: [{ type: "string", name: "x", required: false }], trigger_parameters: [] } },
        node,
        { id: "900001", type: "2", meta: { position: { x: 600, y: 0 } }, data: { nodeMeta: { title: "结束", icon: "", description: "", mainColor: "#faad14", subTitle: "" }, inputs: { terminatePlan: "returnVariables", inputParameters: [{ name: "out", input: { type: "string", value: { type: "literal", content: "done" } } }] }, outputs: [] } },
      ],
      edges: [
        { sourceNodeID: "100001", targetNodeID: "200101" },
        { sourceNodeID: "200101", targetNodeID: "900001" },
      ],
    };
    // 孤立节点（如注释）：不连边
    const isIsolated = node.isolated;
    delete node.isolated;
    schema.edges = isIsolated
      ? [{ sourceNodeID: "100001", targetNodeID: "900001" }]
      : schema.edges;
    // 保存
    const lock = await call("edit_lock", { workflow_id: wfId, space_id: SPACE, action: "acquire" });
    const cur = await call("canvas", { workflow_id: wfId, space_id: SPACE });
    const save = await call("save", { workflow_id: wfId, schema: JSON.stringify(schema), space_id: SPACE, submit_commit_id: cur.data.vcs_data.submit_commit_id, ignore_status_transfer: true });
    if (save.code !== 0) {
      console.log(`[type ${type}] 候选${i + 1} SAVE失败: ${save.code} ${save.msg.slice(0, 120)}`);
      continue;
    }
    // 运行
    const tr = await call("test_run", { workflow_id: wfId, input: {}, space_id: SPACE });
    if (tr.code !== 0) {
      console.log(`[type ${type}] 候选${i + 1} RUN失败: ${tr.code} ${tr.msg.slice(0, 200)}`);
      continue;
    }
    console.log(`[type ${type}] 候选${i + 1} ✅ 保存+运行通过! execute_id=${tr.data?.execute_id}`);
    return;
  }
  console.log(`[type ${type}] 所有候选都失败`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
