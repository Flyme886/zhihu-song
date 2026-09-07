import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 《蓝血》故事包有服务端结算与 SQLite 试玩局，不能再做纯静态导出。
  // 部署目标须为 Node.js Server；运行时依然不调用 LLM。
  trailingSlash: true,

  images: {
    // 远程故事封面不依赖 Next 图片优化，保持部署行为稳定。
    unoptimized: true,
  },

  // 关掉左下角那个开发态圆标。牌桌要满屏，投影时任何浮层都是干扰
  devIndicators: false,
};

export default nextConfig;
