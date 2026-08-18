/**
 * 名言解读器：全节点类型测试工作流
 * start(多输入) → db(43 查库) → code(5 提取+判断) → condition(8 分支)
 *   ├─ true → llm(3 解读) → merge(32)
 *   └─ false → merge(32, 原文)
 * → end
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";

const DB_ID = "7675037609596289024"; // quotes_lib
const good = JSON.parse(readFileSync("/tmp/coze-probe/known-good-llm.json", "utf8"));

function literal(name, type, content, rawType) {
  return { name, input: { type, value: { type: "literal", content, rawMeta: { type: rawType } } } };
}
function refInput(name, type, blockID, refName, rawType = 1) {
  return { name, input: { type, value: { type: "ref", content: { source: "block-output", blockID, name: refName }, rawMeta: { type: rawType } } } };
}

// LLM 节点：复用平台验证结构
const llm = JSON.parse(JSON.stringify(good));
llm.id = "200104";
llm.meta = { position: { x: 1200, y: 0 } };
llm.data.nodeMeta.title = "名言解读";
llm.data.inputs.inputParameters = [
  refInput("quote", "string", "200102", "quote"),
  refInput("author", "string", "200102", "author"),
  refInput("mood", "string", "100001", "mood"),
];
for (const p of llm.data.inputs.llmParam) {
  if (p.name === "prompt") p.input.value.content = "你是一位温暖的人生导师。用户看到这句名言「{{quote}}」（出自{{author}}），此刻心情是：{{mood}}。请结合名言给用户一句温暖的解读，100 字以内。";
  if (p.name === "systemPrompt") p.input.value.content = "你只输出解读正文。";
}

const schema = {
  versions: { loop: "v2" },
  nodes: [
    {
      id: "100001", type: "1",
      meta: { position: { x: 0, y: 0 } },
      data: {
        nodeMeta: { title: "开始", description: "输入分类和心情", icon: "", subTitle: "", mainColor: "#52c41a" },
        outputs: [
          { type: "string", name: "category", required: true },
          { type: "string", name: "mood", required: true },
        ],
        trigger_parameters: [],
      },
    },
    {
      id: "200101", type: "43",
      meta: { position: { x: 300, y: 0 } },
      data: {
        nodeMeta: { title: "查名言", description: "按分类查名言库", icon: "", subTitle: "", mainColor: "#eb2f96" },
        inputs: {
          databaseInfoList: [{ databaseInfoID: DB_ID }],
          selectParam: {
            condition: {
              conditionList: [[
                { name: "left", input: { type: "string", value: { type: "literal", content: "category" } } },
                { name: "operation", input: { type: "string", value: { type: "literal", content: "EQUAL" } } },
                refInput("right", "string", "100001", "category"),
              ]],
              logic: "AND",
            },
            orderByList: [],
            limit: 100,
          },
          settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 },
        },
        outputs: [
          { type: "list", name: "outputList", schema: { type: "object", schema: [] } },
          { type: "integer", name: "rowNum" },
        ],
        version: "43",
      },
    },
    {
      id: "200102", type: "5",
      meta: { position: { x: 600, y: 0 } },
      data: {
        nodeMeta: { title: "提取名言", description: "取第一条并判断长度", icon: "", subTitle: "", mainColor: "#00B2B2" },
        inputs: {
          inputParameters: [refInput("outputList", "list", "200101", "outputList", 103)],
          code: `async def main(args: Args) -> Output:
    params = args.params
    output_list = params.get("outputList") or []
    quote = ""
    author = ""
    if isinstance(output_list, list) and len(output_list) > 0:
        first = output_list[0] if isinstance(output_list[0], dict) else {}
        quote = str(first.get("text", ""))
        author = str(first.get("author", ""))
    is_long = len(quote) > 15
    return {"quote": quote, "author": author, "is_long": is_long}`,
          language: 3,
          settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 },
        },
        outputs: [
          { type: "string", name: "quote" },
          { type: "string", name: "author" },
          { type: "boolean", name: "is_long" },
        ],
        version: "5",
      },
    },
    {
      id: "200103", type: "8",
      meta: { position: { x: 900, y: 0 } },
      data: {
        nodeMeta: { title: "是否长句", description: "长句走解读，短句直接输出", icon: "", subTitle: "", mainColor: "#00B2B2" },
        inputs: {
          branches: [{
            condition: {
              logic: 2,
              conditions: [{
                operator: 11,
                left: { input: { type: "boolean", value: { type: "ref", content: { source: "block-output", blockID: "200102", name: "is_long" } } } },
              }],
            },
          }],
        },
        outputs: [],
        version: "8",
      },
    },
    llm,
    {
      id: "200105", type: "32",
      meta: { position: { x: 1500, y: 0 } },
      data: {
        inputs: {
          mergeGroups: [{
            name: "Group1",
            variables: [
              { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "200104", name: "output" }, rawMeta: { type: 1 } } },
              { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "200102", name: "quote" }, rawMeta: { type: 1 } } },
            ],
          }],
        },
        outputs: [{ type: "string", name: "Group1" }],
        nodeMeta: { title: "聚合结果", description: "聚合两分支", icon: "", subTitle: "", mainColor: "#00B2B2" },
        version: "32",
      },
    },
    {
      id: "900001", type: "2",
      meta: { position: { x: 1800, y: 0 } },
      data: {
        nodeMeta: { title: "结束", description: "返回解读", icon: "", subTitle: "", mainColor: "#faad14" },
        inputs: {
          terminatePlan: "returnVariables",
          inputParameters: [
            { name: "result", input: { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "200105", name: "Group1" } } } },
          ],
        },
        outputs: [],
        version: "2",
      },
    },
  ],
  edges: [
    { sourceNodeID: "100001", targetNodeID: "200101" },
    { sourceNodeID: "200101", targetNodeID: "200102" },
    { sourceNodeID: "200102", targetNodeID: "200103" },
    { sourceNodeID: "200103", targetNodeID: "200104", sourcePortID: "true" },
    { sourceNodeID: "200103", targetNodeID: "200105", sourcePortID: "false" },
    { sourceNodeID: "200104", targetNodeID: "200105", sourcePortID: "default" },
    { sourceNodeID: "200104", targetNodeID: "900001", sourcePortID: "branch_error" },
    { sourceNodeID: "200105", targetNodeID: "900001" },
  ],
};

writeFileSync("/tmp/coze-probe/quote-analyzer-schema.json", JSON.stringify(schema, null, 2));
console.log("✅ 名言解读器 schema 生成（7 节点：start/db/code/condition/llm/merge/end）");
