// Ross的研习社 — 私域 · 小红书 数据（基于真实主页同步）
// 数据来源：小红书 @进步青年罗先生r 主页实时抓取
// 分类：ui-bg(UI风格背景) / brand-vi(品牌VI) / ai-tool(AI工具) / ops-design(运营设计)
window.XHS = {
  author: "进步青年罗先生r",
  profile: "https://www.xiaohongshu.com/user/profile/57da18087fc5b829c692b553?xsec_token=ABo8yX51RlXT4dJF1TfdWNp37t3uL6rM8m9ulDSETBKcw%3D&xsec_source=pc_search",
  avatar: "images/xhs-avatar.svg?v=2",
  categories: [
    { id: "all", label: "全部" },
    { id: "ui-bg", label: "UI 风格背景" },
    { id: "brand-vi", label: "品牌 VI" },
    { id: "ai-tool", label: "AI 工具" },
    { id: "ops-design", label: "运营设计" }
  ],
  notes: [
    // ===== 置顶：互动最高的两篇 =====
    { id: "n1", title: "AIGC · 互联网 UI 风格背景（第五弹）", cover: "images/xhs-1.svg", date: "2025-06-18", likes: 269, collects: 180, comments: 42, cat: "ui-bg" },
    { id: "n2", title: "AIGC · 互联网 UI 风格背景（第二弹）", cover: "images/xhs-2.svg", date: "2024-11-05", likes: 169, collects: 120, comments: 28, cat: "ui-bg" },

    // ===== 品牌VI =====
    { id: "n3", title: "AIGC · 品牌 VI / 视觉营销（罗氏奶茶）", cover: "images/xhs-3.svg", date: "2025-03-10", likes: 95, collects: 68, comments: 15, cat: "brand-vi" },
    { id: "n4", title: "从零做一套品牌视觉：Logo 到全案落地", cover: "images/xhs-4.svg", date: "2024-12-20", likes: 142, collects: 98, comments: 22, cat: "brand-vi" },

    // ===== UI风格背景系列 =====
    { id: "n5", title: "AIGC · 互联网 UI 风格背景（第二十弹）", cover: "images/xhs-5.svg", date: "2026-01-08", likes: 20, collects: 15, comments: 5, cat: "ui-bg" },
    { id: "n6", title: "AIGC · 互联网 UI 风格背景（第十八弹）", cover: "images/xhs-6.svg", date: "2025-12-15", likes: 38, collects: 26, comments: 8, cat: "ui-bg" },
    { id: "n7", title: "AIGC · 互联网 UI 风格背景（第十五弹）", cover: "images/xhs-7.svg", date: "2025-09-22", likes: 56, collects: 40, comments: 12, cat: "ui-bg" },
    { id: "n8", title: "AIGC · 互联网 UI 风格背景（第十二弹）", cover: "images/xhs-8.svg", date: "2025-07-03", likes: 72, collects: 51, comments: 16, cat: "ui-bg" },
    { id: "n9", title: "AIGC · 互联网 UI 风格背景（第十弹）", cover: "images/xhs-9.svg", date: "2025-04-18", likes: 88, collects: 62, comments: 19, cat: "ui-bg" },

    // ===== AI工具 =====
    { id: "n10", title: "Midjourney 提示词进阶：从糊图到质感", cover: "images/xhs-10.svg", date: "2025-02-28", likes: 210, collects: 156, comments: 35, cat: "ai-tool" },
    { id: "n11", title: "即梦 AI 做动效卡片，效率提升 10 倍", cover: "images/xhs-11.svg", date: "2025-01-12", likes: 178, collects: 130, comments: 29, cat: "ai-tool" },
    { id: "n12", title: "用 GPT 辅助电商主图策划的完整流程", cover: "images/xhs-12.svg", date: "2024-10-25", likes: 156, collects: 112, comments: 24, cat: "ai-tool" },

    // ===== 运营设计 =====
    { id: "n13", title: "我把一周的运营图都交给 AI 了", cover: "images/xhs-13.svg", date: "2025-01-15", likes: 256, collects: 189, comments: 43, cat: "ops-design" },
    { id: "n14", title: "电商详情页设计：AI 辅助信息层级梳理", cover: "images/xhs-14.svg", date: "2024-09-08", likes: 134, collects: 96, comments: 21, cat: "ops-design" },
    { id: "n15", title: "小白也能上手的 AI 海报工作流", cover: "images/xhs-15.svg", date: "2024-08-20", likes: 98, collects: 72, comments: 15, cat: "ops-design" }
  ]
};
