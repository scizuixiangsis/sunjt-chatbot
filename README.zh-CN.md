<a href="https://chat.vercel.ai/">
  <img alt="Chatbot" src="app/(chat)/opengraph-image.png">
  <h1 align="center">Chatbot</h1>
</a>

<p align="center">
  Chatbot（原 AI Chatbot）是一个基于 Next.js 和 AI SDK 构建的免费开源模板，可帮助你快速搭建功能强大的聊天机器人应用。
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> ·
  <a href="https://chatbot.dev"><strong>查看文档</strong></a> ·
  <a href="#功能特性"><strong>功能特性</strong></a> ·
  <a href="#模型提供商"><strong>模型提供商</strong></a> ·
  <a href="#自行部署"><strong>自行部署</strong></a> ·
  <a href="#本地运行"><strong>本地运行</strong></a>
</p>
<br/>

## 功能特性

- [Next.js](https://nextjs.org) App Router
  - 使用高级路由能力，实现流畅导航和更好的性能表现
  - 结合 React Server Components（RSC）和 Server Actions，提升服务端渲染能力与整体性能
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - 通过统一 API 支持文本生成、结构化对象生成以及工具调用
  - 提供用于构建动态聊天界面和生成式 UI 的 Hooks
  - 通过 AI Gateway 支持 OpenAI、Anthropic、Google、xAI 等多种模型提供商
- [shadcn/ui](https://ui.shadcn.com)
  - 使用 [Tailwind CSS](https://tailwindcss.com) 进行样式开发
  - 基于 [Radix UI](https://radix-ui.com) 组件原语，兼顾可访问性和灵活性
- 数据持久化
  - 使用 [Neon Serverless Postgres](https://vercel.com/marketplace/neon) 存储聊天记录和用户数据
  - 使用 [Vercel Blob](https://vercel.com/storage/blob) 高效管理文件存储
- [Auth.js](https://authjs.dev)
  - 提供简单且安全的认证能力

## 模型提供商

该模板通过 [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) 以统一接口接入多个 AI 模型。模型配置位于 `lib/ai/models.ts`，并支持针对不同模型进行提供商路由。当前内置模型包括：Mistral、Moonshot、DeepSeek、OpenAI 和 xAI。

这个仓库还额外支持一条 Claude 专用通道和一条通用 OpenAI 兼容代理通道：

- **AI Gateway**（默认）：非 Claude 模型继续走 AI Gateway。
- **Anthropic SDK**：Claude 模型可以走官方 Anthropic API，或者走 qnaigc 这类 Anthropic 兼容网关。
- **OpenAI 兼容代理**：当 `ANTHROPIC_BASE_URL` 指向通用代理（如 `https://newapi.dzkjm.cn`）时，所有支持的模型都会通过 OpenAI 兼容协议（`/v1/chat/completions`）路由。当前支持 `claude-sonnet-4-6`、`claude-opus-4-6` 和 `gemini-3.1-pro-preview`。

切换方式由环境变量控制：默认模型继续依赖 `AI_GATEWAY_API_KEY`，Claude 侧使用 `ANTHROPIC_API_KEY`，如需走兼容网关再额外设置 `ANTHROPIC_BASE_URL`。当 `ANTHROPIC_BASE_URL=https://api.qnaigc.com` 时，应用会按 Anthropic Messages API 协议调用；其他自定义地址则按 OpenAI 兼容协议调用。

### AI Gateway 认证

**部署到 Vercel 时**：认证会通过 OIDC Token 自动完成。

**非 Vercel 部署时**：你需要在 `.env.local` 中设置 `AI_GATEWAY_API_KEY` 环境变量，提供 AI Gateway API Key。

借助 [AI SDK](https://ai-sdk.dev/docs/introduction)，你也可以只用少量代码切换到直连模型提供商，例如 [OpenAI](https://openai.com)、[Anthropic](https://anthropic.com)、[Cohere](https://cohere.com/) 等，或接入 [更多提供商](https://ai-sdk.dev/providers/ai-sdk-providers)。

实际使用时，可以把它理解为一套多通道配置：

- `AI_GATEWAY_API_KEY` 负责原本那组 Gateway 模型。
- `ANTHROPIC_API_KEY` 负责 Claude 直连或代理访问。
- `ANTHROPIC_BASE_URL` 在直连官方 Anthropic 时可不填；走兼容网关时需要填写。
  - `https://api.qnaigc.com` → Anthropic Messages API 协议（qnaigc）
  - 其他地址（如 `https://newapi.dzkjm.cn`）→ OpenAI 兼容协议
- 每次修改 `.env.local` 后，都要重启 `pnpm dev`，让 Next.js 重新加载服务端环境变量。

如果把这几个中间层放在一起看：AI Gateway 是这个项目默认使用的多供应商总网关；qnaigc 是一个第三方 Anthropic 兼容网关，用于 Claude 通道；通用 OpenAI 兼容代理（如 newapi.dzkjm.cn）可以通过单一端点服务多个模型家族（Claude、Gemini 等）。

## 自行部署

你可以一键将自己的 Chatbot 部署到 Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/templates/next.js/chatbot)

## 本地运行

运行 Chatbot 前，需要先配置 [`.env.example`](.env.example) 中定义的环境变量。推荐使用 [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) 管理这些变量，不过只使用本地 `.env` 文件也可以完成运行。

> 注意：不要提交 `.env` 文件，否则其中的密钥可能会暴露，进而导致他人能够访问并控制你的 AI 或认证服务账号。

1. 安装 Vercel CLI：`npm i -g vercel`
2. 将本地项目与 Vercel 和 GitHub 账号关联（会创建 `.vercel` 目录）：`vercel link`
3. 拉取环境变量：`vercel env pull`

```bash
pnpm install
pnpm db:migrate # 初始化数据库或应用最新数据库变更
pnpm dev
```

完成后，你的应用应该已经运行在 [localhost:3000](http://localhost:3000)。