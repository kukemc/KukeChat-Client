# 贡献指南

感谢你愿意为 KukeChat 客户端出一份力。

## 开始之前

这个仓库只包含客户端。要跑起来需要一个提供相同 REST + WebSocket 接口的后端，
并在 `.env` 里通过 `VITE_API_BASE_URL` / `VITE_WS_URL` 指向它。详见 [README](README.md)。

```bash
npm install
cp .env.example .env
npm run dev
```

## 提交 PR 前

请确认这两条都通过：

```bash
npm run typecheck
npm run build
```

改动涉及桌面端或移动端时，也请分别验证 `npm run build:desktop-web` / `npm run build:mobile-web`。

## 代码约定

- TypeScript 严格模式，不要引入 `any` 兜底；类型定义放在 `src/types/`。
- 新的部署相关地址一律走 `src/config/env.ts` + `.env.example`，**不要在业务代码里写死域名**。
- CCW 平台相关的固定链接放 `src/config/ccw.ts`，应用署名信息放 `src/config/branding.ts`。
- 组件按功能域放进 `src/components/<域>/`，跟随现有目录的命名与写法。
- 注释写「为什么」，不写「做了什么」；保持与周围代码一致的密度。

## 提交 Issue

Bug 报告请说明：客户端形态（扩展 / 桌面 / Android）、版本号、复现步骤，以及浏览器或系统版本。

## License

提交贡献即表示同意你的代码以 [MIT](LICENSE) 协议发布。
