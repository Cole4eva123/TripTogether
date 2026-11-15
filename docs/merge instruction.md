# Gasoline intelligence 合并说明

## 分支和命名

开发分支为 `gasoline_intelligence`，功能名称及 URL 使用 `gasoline-intelligence`。
本模块继续基于仓库现有的 Next.js App Router、React、TypeScript 和 Tailwind CSS v4 开发。
以下 Git 命令供维护者后续准备合并时使用；本次整理没有执行分支合并或推送。

## 在原框架中的位置

| 位置 | 职责及复用关系 |
|---|---|
| `app/trips/gasoline-intelligence/` | 功能页面及加载状态，继承原来的 `app/trips/layout.tsx` 登录检查和导航 |
| `app/api/gasoline-intelligence/` | `vehicle`、`search`、`plan` 三个 Route Handler，沿用原项目的服务端接口组织方式 |
| `components/gasoline-intelligence/` | 页面主组件 `GasolineIntelligence.tsx`、交互地图 `FuelMap.tsx`、结果组件 `FuelResults.tsx` |
| `lib/gasoline-intelligence.ts` | 规划算法、续航检查、价格比较、建议加油量和费用计算 |
| `lib/gasoline-intelligence.test.ts` | 规划逻辑测试，继续由现有 `npm test` 脚本发现 |
| `lib/fuel-types.ts`、`lib/fuel-validation.ts` | 加油业务的数据类型和输入校验 |
| `lib/fuel-service.ts` | 会话检查、查询编排、用户隔离、临时缓存及限流 |
| `lib/fuel-ai.ts`、`lib/fuel-maps.ts`、`lib/fuel-http.ts` | 外部服务访问和结果校验，供服务端接口调用 |
| `lib/fuel-region-provider.ts`、`lib/fuel-regions.ts`、`lib/fuel-regions.test.ts` | 州均价获取、解析和测试 |
| `docs/gasoline-intelligence.md`、`docs/api.md` | 配置说明、业务行为和接口契约 |

辅助文件中的 `fuel` 表示加油业务领域；对外入口和核心规划模块统一使用 `gasoline-intelligence`。
项目仍使用同一份 `package.json`、原有构建配置和测试命令，功能代码直接放在原来的目录体系中。
样式继续使用现有主题色和 Tailwind 工具类。

## 与其他模块的接入点

### 登录和用户上下文

- 前端复用 `components/me.tsx` 的 `useMe()` 和旅行区布局中的登录流程。
- 服务端复用 `lib/server.ts` 的 `currentUser()`、`needLogin()` 和 `readJson()`。
- 浏览器请求继续通过 `lib/api.ts` 发起，统一处理 JSON、会话 cookie 和错误信息。
- 查询缓存使用当前登录用户的 `id` 隔离，其他用户无法使用该查询 ID 规划路线。

如果目标分支已接入 Better Auth，应保留目标分支的正式登录实现，再对齐上述公共函数的返回值。
`currentUser()` 需要返回具有稳定 `id` 的用户对象；未登录时返回 `null`。如果其接口发生变化，
主要调整 `lib/fuel-service.ts` 中的适配调用，并同步前端用户上下文。

### 旅行信息

旅行详情入口通过查询参数传递出发地和目的地：

```text
/trips/gasoline-intelligence?origin=...&destination=...
```

旅行详情使用 `URLSearchParams` 编码参数。加油模块当前不修改旅行、成员或共享行程数据。
搜索及规划结果保存在进程内，搜索有效期为 30 分钟，服务重启后失效。如果后续需要保存规划，
应沿用团队的数据库和 ORM，在服务层增加持久化及旅行成员权限检查。

### 接口路径

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/gasoline-intelligence/vehicle` | 自然语言识别车型，返回待确认的参数和来源 |
| POST | `/api/gasoline-intelligence/search` | 查询道路路线、候选站和地区油价 |
| POST | `/api/gasoline-intelligence/plan` | 自动推荐，或按照用户选择重新规划 |

请求和响应类型见 `lib/fuel-types.ts`，状态码及字段约定见 `docs/api.md`。
调整接口路径时，应同时修改页面调用、Route Handler 目录及接口文档。

## 容易发生冲突的共享文件

| 文件 | 合并时的处理方式 |
|---|---|
| `app/trips/layout.tsx` | 保留目标分支的登录、用户信息、退出和其他导航，再加入 Gasoline intelligence 入口；窄屏导航允许换行 |
| `app/trips/[id]/page.tsx` | 保留目标分支的数据加载、权限和行程逻辑，再加入传递 `origin`、`destination` 的入口链接 |
| `package.json` | 沿用团队确定的框架版本和脚本，补入运行依赖 `leaflet` 与开发依赖 `@types/leaflet` |
| `package-lock.json` | 先解决 `package.json`，再执行 `npm install --package-lock-only` 生成一致的锁文件，随后运行 `npm ci` 检查 |
| `README.md`、`docs/api.md` | 保留团队其他模块的内容，将本模块的说明合并进去 |
| `.gitignore` | 保留现有规则，并保留环境文件和本地凭据说明文件的忽略规则；`.env.example` 作为无密钥的配置模板纳入版本管理 |

框架基础文件 `app/layout.tsx`、`app/globals.css`、`next.config.ts`、`tsconfig.json` 以及
公共业务文件 `lib/server.ts`、`lib/api.ts`、`lib/mock-db.ts`、`components/me.tsx` 没有因本模块被重写。
若目标分支修改了这些公共文件，应保留其改进，并检查模块调用是否兼容。

当前框架启用了 Cache Components：保留页面中的 `Suspense`，Route Handler 使用框架默认运行时。
框架版本发生变化时，以目标版本自带的文档和构建结果为准。

## 准备功能提交

先确认所在分支和工作区状态：

```powershell
git branch --show-current
git status --short
```

分支应为 `gasoline_intelligence`。审阅本模块新增文件和共享文件中的修改，再选择性暂存。
对于共享文件可使用 `git add -p`，逐段检查；本地原有的无关修改和删除应单独处理。
暂存后再次确认提交内容：

```powershell
git diff --cached --stat
git diff --cached
```

实际密钥、`.env.local`、本地账号或凭据说明文件应保留在个人环境中。
检查无误后，再由维护者创建功能提交。

## 在功能分支同步目标分支

以下以将来合入 `dev` 为例。先完成本模块提交，并确保工作区干净；所有同步及冲突处理仍在
`gasoline_intelligence` 上进行：

```powershell
git branch --show-current
git fetch origin
git merge origin/dev
```

`fetch` 更新本地的远程跟踪信息，`merge origin/dev` 将目标分支的最新内容合入当前功能分支。
这一步用于提前解决兼容性和冲突，不会向远程 `dev` 推送代码。
遇到冲突时，按上面的共享文件表逐段整合，检查差异后再完成合并提交。

## 合并前检查

在项目根目录执行原框架的检查命令：

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

人工验收重点：

1. 原来的登录、旅行列表、详情和行程编辑正常，其他模块的导航仍在。
2. 登录后能从导航及旅行详情进入 `/trips/gasoline-intelligence`，旅行的起终点能正确带入。
3. 车型识别结果需要用户确认，确认后可查询并规划。
4. 地图、站点、州均价、加油量、费用及到达时间正常显示；估算价有明确标签。
5. 手动增删停靠点后可以重新计算；超出续航或连续驾驶时间限制时显示错误。
6. 未登录调用三个新接口返回 `401`，项目代码和提交中没有实际密钥。

## 提交合并请求

检查通过后，仅推送功能分支：

```powershell
git push origin gasoline_intelligence
```

随后创建 Pull Request，比较分支选择 `gasoline_intelligence`，目标分支选择团队确认的分支
（例如 `dev`）。在说明中列出模块入口、共享文件的改动、配置变量和检查结果，
由目标分支维护者完成最终审查及合并。
