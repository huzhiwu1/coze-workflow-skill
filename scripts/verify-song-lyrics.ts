/**
 * 端到端验证：歌名 → 数据库查音频 → 多模态 LLM 识别歌词
 * start(song) → database_query(43, 按 song 查 sing_test) → code(5, 取 url) → llm(3, 多模态) → end
 */
import { writeFileSync } from "node:fs";

const DB_ID = "7675028269967605760"; // sing_test 的 databaseInfoID（res_id）

function literal(name, type, content, rawType) {
  return { name, input: { type, value: { type: "literal", content, rawMeta: { type: rawType } } } };
}
function refInput(name, type, blockID, refName) {
  return { name, input: { type, value: { type: "ref", content: { source: "block-output", blockID, name: refName }, rawMeta: { type: 1 } } } };
}

const schema = {
  versions: { loop: "v2" },
  nodes: [
    {
      id: "100001",
      type: "1",
      meta: { position: { x: 0, y: 0 } },
      data: {
        nodeMeta: { title: "开始", description: "输入歌名", icon: "", subTitle: "", mainColor: "#52c41a" },
        outputs: [{ type: "string", name: "song", required: true }],
        trigger_parameters: [],
      },
    },
    {
      id: "200101",
      type: "43",
      meta: { position: { x: 300, y: 0 } },
      data: {
        nodeMeta: { title: "查询歌曲", description: "按歌名查 sing_test", icon: "", subTitle: "", mainColor: "#eb2f96" },
        inputs: {
          databaseInfoList: [{ databaseInfoID: DB_ID }],
          selectParam: {
            condition: {
              conditionList: [[
                { name: "left", input: { type: "string", value: { type: "literal", content: "song" } } },
                { name: "operation", input: { type: "string", value: { type: "literal", content: "EQUAL" } } },
                refInput("right", "string", "100001", "song"),
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
      id: "200102",
      type: "5",
      meta: { position: { x: 600, y: 0 } },
      data: {
        nodeMeta: { title: "提取音频", description: "取第一条音频 URL", icon: "", subTitle: "", mainColor: "#00B2B2" },
        inputs: {
          inputParameters: [refInput("outputList", "list", "200101", "outputList")],
          code: `async def main(args: Args) -> Output:
    params = args.params
    output_list = params.get("outputList") or []
    audio_url = ""
    if isinstance(output_list, list) and len(output_list) > 0:
        first = output_list[0] if isinstance(output_list[0], dict) else {}
        audio_url = first.get("url", "")
    return {"audio_url": audio_url}`,
          language: 3,
          settingOnError: { processType: 1, timeoutMs: 60000, retryTimes: 0 },
        },
        outputs: [{ type: "string", name: "audio_url" }],
        version: "5",
      },
    },
    {
      id: "200103",
      type: "3",
      meta: { position: { x: 900, y: 0 } },
      data: {
        nodeMeta: { title: "歌词识别", description: "多模态识别音频歌词", icon: "", subTitle: "", mainColor: "#5C62FF" },
        inputs: {
          inputParameters: [
            refInput("audio_url", "string", "200102", "audio_url"),
            refInput("song", "string", "100001", "song"),
          ],
          llmParam: [
            literal("temperature", "float", "0.3", 4),
            literal("maxTokens", "integer", "4096", 2),
            literal("topP", "float", "0.9", 4),
            literal("responseFormat", "integer", "2", 2),
            literal("modleName", "string", "Doubao-Seed-2.0-Lite", 1),
            literal("modelType", "integer", "201", 2),
            literal("generationDiversity", "string", "balance", 1),
            literal("supportThinking", "boolean", true, 3),
            literal("enableThinking", "boolean", true, 3),
            literal("apiType", "integer", "1", 2),
            literal("prompt", "string", "你是音乐识别专家。这是歌曲《{{song}}》的音频，音频地址：{{audio_url}}。请听完整音频，输出这首歌的完整歌词（逐句分行）。只输出歌词，不要其他解释。", 1),
            literal("enableChatHistory", "boolean", false, 3),
            literal("chatHistoryRound", "integer", "3", 2),
            literal("systemPrompt", "string", "你只输出歌词正文。", 1),
          ],
          settingOnError: {
            switch: true,
            dataOnErr: JSON.stringify({ output: "", reasoning_content: "" }),
            processType: 3,
            timeoutMs: 120000,
            singleTimeoutMs: 0,
            retryTimes: 1,
            ext: { backupLLmParam: JSON.stringify({ temperature: 0.3, maxTokens: 4096, topP: 0.9, responseFormat: 2, modelName: "Doubao-Seed-2.0-Lite", modelType: 201, generationDiversity: "default_val" }) },
          },
        },
        outputs: [
          { type: "string", name: "output" },
          { type: "string", name: "reasoning_content" },
          { type: "object", name: "errorBody", schema: [{ type: "string", name: "errorMessage", readonly: true }] },
          { type: "boolean", name: "isSuccess" },
        ],
        version: "3",
      },
    },
    {
      id: "900001",
      type: "2",
      meta: { position: { x: 1200, y: 0 } },
      data: {
        nodeMeta: { title: "结束", description: "返回歌词", icon: "", subTitle: "", mainColor: "#faad14" },
        inputs: {
          terminatePlan: "returnVariables",
          inputParameters: [
            {
              name: "lyrics",
              input: { type: "string", value: { type: "ref", content: { source: "block-output", blockID: "200103", name: "output" } } },
            },
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
    { sourceNodeID: "200102", targetNodeID: "200103", sourcePortID: "default" },
    { sourceNodeID: "200102", targetNodeID: "900001", sourcePortID: "branch_error" },
    { sourceNodeID: "200103", targetNodeID: "900001", sourcePortID: "default" },
    { sourceNodeID: "200103", targetNodeID: "900001", sourcePortID: "branch_error" },
  ],
};

writeFileSync("/tmp/coze-probe/song-lyrics-schema.json", JSON.stringify(schema, null, 2));
console.log("✅ schema 已生成（5 节点 6 边）");
console.log("   start → 数据库查询(sing_test) → 代码提取 → 多模态LLM → end");
