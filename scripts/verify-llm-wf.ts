/**
 * LLM 工作流端到端验证：小红书文案生成器
 * 项目格式 CozeWorkflow → convertToPlatformSchema → 保存 → 试运行
 *
 * 场景：输入产品描述 → LLM1 生成种草文案 → LLM2 生成标题 → 结束输出
 */
import { convertToPlatformSchema } from "../src/schema-converter";
import type { CozeWorkflow } from "../src/workflow-types";
import { writeFileSync } from "node:fs";

const wf: CozeWorkflow = {
  meta: {
    name: "小红书文案生成器",
    description: "输入产品描述，生成小红书种草文案 + 3 个标题（LLM 双节点链）",
    version: "1.0",
  },
  nodes: [
    {
      id: "100001",
      type: "start",
      title: "开始",
      inputVariables: [{ name: "product", type: "string", required: true }],
    },
    {
      id: "200101",
      type: "llm",
      title: "种草文案生成",
      userPrompt:
        "你是小红书爆款文案专家。请为产品「{{product}}」写一篇种草文案，要求：3 段、带 emoji、口语化、有真实使用场景感，结尾加 3 个话题标签。",
      systemPrompt: "你只输出文案正文，不要任何解释说明。",
      config: { model: "Doubao-Seed-2.0-Lite", temperature: 0.8, maxTokens: 2048 },
      inputMapping: { product: "100001.product" },
    },
    {
      id: "200102",
      type: "llm",
      title: "标题生成",
      userPrompt:
        "以下是关于「{{product}}」的种草文案：\n\n{{copy}}\n\n请为这篇文案生成 3 个吸引人的小红书标题，要求：每个不超过 20 字、带 emoji、有悬念感，每行一个。",
      systemPrompt: "你只输出 3 个标题，每行一个，不要其他内容。",
      config: { model: "Doubao-Seed-2.0-Lite", temperature: 0.7, maxTokens: 1024 },
      inputMapping: { product: "100001.product", copy: "200101.output" },
    },
    {
      id: "900001",
      type: "end",
      title: "结束",
      outputVariables: [{ name: "titles", value: "200102.output" }],
    },
  ],
  edges: [
    { id: "e1", sourceNodeId: "100001", targetNodeId: "200101" },
    // LLM 出边：default + branch_error 成对（平台约定）
    { id: "e2", sourceNodeId: "200101", targetNodeId: "200102", sourcePort: "default" },
    { id: "e2err", sourceNodeId: "200101", targetNodeId: "900001", sourcePort: "branch_error" },
    { id: "e3", sourceNodeId: "200102", targetNodeId: "900001", sourcePort: "default" },
    { id: "e3err", sourceNodeId: "200102", targetNodeId: "900001", sourcePort: "branch_error" },
  ],
};

const platformSchema = convertToPlatformSchema(wf);
writeFileSync("/tmp/coze-probe/llm-wf-schema.json", platformSchema);
const parsed = JSON.parse(platformSchema);
console.log("✅ 转换成功");
console.log("   nodes:", parsed.nodes.map((n: any) => `${n.id}(type=${n.type})`).join(", "));
console.log("   edges:", parsed.edges.length, "条");
console.log("   LLM llmParam 项数:", parsed.nodes.find((n: any) => n.id === "llm1")?.data?.inputs?.llmParam?.length);
console.log("   平台 schema 已写入 /tmp/coze-probe/llm-wf-schema.json");
