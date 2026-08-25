const express = require("express");

const router = express.Router();

function fallbackAiPlan({ fileName = "素材", mediaType = "video" } = {}) {
  const themeText = (fileName || "").toLowerCase();
  const isImage = mediaType === "image";
  let theme = "lifestyle";

  if (/(travel|trip|outdoor|mountain|beach|city|road|culture|landscape)/.test(themeText)) theme = "travel";
  else if (/(food|meal|restaurant|cooking|dessert|coffee|daily|street|portrait)/.test(themeText)) theme = "lifestyle";
  else if (/(tech|ai|gadget|phone|camera|computer|review|digital|product)/.test(themeText)) theme = "tech";

  const themeMap = {
    travel: {
      title: `旅行日记：在${new Date().getMonth() + 1}月的旅程里，最值得记录的日出瞬间`,
      description: "这段旅行素材聚焦城市、自然景观与人物情绪的对比，适合打造强视觉冲击和高情绪共鸣的短视频内容。",
      tags: ["#旅行", "#城市日记", "#短视频故事", "#旅行vlog"],
      scenes: [
        { time: "0-3s", title: "开场钩子", copy: "用地标画面和人物情绪迅速建立内容的地域感和停留价值。" },
        { time: "3-8s", title: "故事展开", copy: "切入路线和城市细节，让观众理解旅行的情绪背景与主题。" },
        { time: "8-13s", title: "高光瞬间", copy: "放大最吸睛的自然景观和关键行为，提升内容记忆点。" },
        { time: "13-17s", title: "结尾收束", copy: "以一句总结式结语打上情绪收尾，强化评论和收藏。" },
      ],
    },
    tech: {
      title: "科技测评：这款产品的真实体验，值得看完每一个细节",
      description: "这类素材适合快速讲清功能、体验和真实感，适合做产品测评、功能拆解和细节展示。",
      tags: ["#数码评测", "#科技体验", "#产品测评", "#AI剪辑"],
      scenes: [
        { time: "0-2s", title: "开场产品展示", copy: "通过产品外观和场景渲染建立强烈的视觉冲击。" },
        { time: "2-7s", title: "功能拆解", copy: "重点展示核心功能和真实使用场景，突出产品价值。" },
        { time: "7-12s", title: "对比验证", copy: "加入对比或者细节镜头，提升可信度和信任感。" },
        { time: "12-15s", title: "结尾 CTA", copy: "通过一句总结和呼吁，让用户积极停留评论。" },
      ],
    },
    lifestyle: {
      title: "生活日记：日常里最值得留下的那一刻，记录真实生活的温度",
      description: "这类素材适合生活方式内容，以真实情绪和细节呈现，增强代入感和内容传播力。",
      tags: ["#生活方式", "#日记短片", "#真实记录", "#创意剪辑"],
      scenes: [
        { time: "0-3s", title: "情绪开场", copy: "快速拉近观众距离，突出当下的情绪和氛围。" },
        { time: "3-8s", title: "真实细节", copy: "放大动作、生活碎片和人物表情，提升真实感。" },
        { time: "8-12s", title: "高潮收束", copy: "抓住最有情绪的瞬间，形成强记忆点。" },
        { time: "12-16s", title: "情绪结尾", copy: "用一句总结式结语收尾，强化共鸣和完播率。" },
      ],
    },
  };

  const chosen = themeMap[theme] || themeMap.lifestyle;
  const titlePrefix = isImage ? "图片叙事：" : "短视频：";

  return {
    title: `${titlePrefix}${chosen.title}`,
    description: chosen.description,
    tags: chosen.tags,
    format: "竖版 9:16",
    duration: isImage ? 16 : 18,
    scenes: chosen.scenes,
    source: "fallback",
  };
}

async function generateWithOpenAI({ fileName, mediaType, fileSize }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "You are a short-video copywriter and editor. Generate a JSON object with title, description, tags, format, duration, scenes. The title should feel native to Douyin/short-form creators. Keep format and scenes concise. Use Chinese. output valid JSON only.",
        },
        {
          role: "user",
          content: `
            任务：为以下素材生成适合短视频平台的 AI 剪辑方案。
            素材名称：${fileName || "unknown"}
            素材类型：${mediaType === "image" ? "图片素材" : "视频素材"}
            文件大小：${fileSize || 0} bytes
            目标：生成提高停留和互动率的标题、文案、标签和剪辑脚本。
            输出必须是 JSON，字段：title, description, tags, format, duration, scenes.
            scenes 是 4 个对象的数组，每个对象里至少包含 time, title, copy。
          `,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API request failed: ${response.status} ${err}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI response missing content.");

  const parsed = JSON.parse(content);
  if (!parsed.title || !Array.isArray(parsed.tags) || !Array.isArray(parsed.scenes)) {
    throw new Error("AI returned invalid content schema.");
  }

  return {
    ...parsed,
    source: "openai",
  };
}

router.post("/generate", async (req, res) => {
  try {
    const { fileName = "素材", mediaType = "video", fileSize = 0 } = req.body || {};

    let result = null;
    try {
      result = await generateWithOpenAI({ fileName, mediaType, fileSize });
    } catch (error) {
      console.warn("[gclips-ai] OpenAI call failed, falling back:", error.message);
    }

    const finalResult = result || fallbackAiPlan({ fileName, mediaType });
    res.json(finalResult);
  } catch (error) {
    res.status(500).json({ error: error.message || "AI generation failed." });
  }
});

module.exports = router;
