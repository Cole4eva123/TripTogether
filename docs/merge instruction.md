# Gasoline Intelligence 合并说明

## 分支和命名

开发分支为 `feature/gasoline-intelligence`，功能名称及 URL 使用 `gasoline-intelligence`。
本模块继续基于仓库现有的 Next.js App Router、React、TypeScript 和 Tailwind CSS v4 开发。
以下 Git 命令供维护者后续准备合并时使用；模块开发及提交仅在当前功能分支进行，合并目标由团队确定。

## 在原框架中的位置

| 位置 | 职责及复用关系 |
|---|---|
| `app/trips/gasoline-intelligence/` | 功能页面及加载状态，继承原来的 `app/trips/layout.tsx` 登录检查和导航 |
| `app/api/gasoline-intelligence/` | `vehicle`、`search`、`plan` 三个 Route Handler，沿用原项目的服务端接口组织方式 |
| `components/gasoline-intelligence/` | 页面主组件 `GasolineIntelligence.tsx`、交互地图 `FuelMap.tsx`、结果组件 `FuelResults.tsx`、搜索状态和单位开关 `FuelSearchBar.tsx`、悬停说明按钮 `OneClickPlanButton.tsx` |
| `lib/gasoline-intelligence/planner.ts` | 规划算法、续航检查、价格比较、建议加油量和费用计算 |
| `lib/gasoline-intelligence/planner.test.ts` | 规划逻辑测试，继续由现有 `npm test` 脚本发现 |
| `lib/gasoline-intelligence/types.ts`、`lib/gasoline-intelligence/validation.ts` | 加油业务的数据类型和输入校验 |
| `lib/gasoline-intelligence/display.ts`、`lib/gasoline-intelligence/display.test.ts` | mi/km 显示换算、站点三段距离和搜索有效期倒计时的格式与测试；接口仍使用英里 |
| `lib/gasoline-intelligence/form.ts`、`lib/gasoline-intelligence/form.test.ts` | 现有表单默认值、车辆回填和请求转换；隐藏可选面板后保留原默认行为 |
| `lib/gasoline-intelligence/prompts.ts`、`lib/gasoline-intelligence/ai.ts` | DeepSeek 车型识别提示词、schema、来源提取及车辆参数校验，不再查询站点或油价 |
| `lib/gasoline-intelligence/ai-cache.ts`、`lib/gasoline-intelligence/ai-cache.test.ts` | 有界缓存、重复请求合并和并行查询上限 |
| `lib/gasoline-intelligence/service.ts` | 会话检查、查询编排、用户隔离、临时缓存及限流 |
| `lib/gasoline-intelligence/provider.ts`、`lib/gasoline-intelligence/google.ts`、`lib/gasoline-intelligence/google-data.ts` | Google 配置检查、结构化路线与单站油价适配、纯数据解析及测试 |
| `components/gasoline-intelligence/GoogleFuelMap.tsx` | 现有 `FuelMap.tsx` 统一使用的 Google 地图实现，不改写共享框架 |
| `lib/gasoline-intelligence/http.ts`、`lib/gasoline-intelligence/regions.ts` | 外部 JSON 请求、超时处理及州名标准化 |
| `docs/gasoline-intelligence.md`、`docs/google-maps-setup.md`、`docs/api.md` | 配置说明、业务行为和接口契约 |

模块源码和对应测试统一放在 `lib/gasoline-intelligence/`，使用 `planner.ts`、`ai.ts`、`types.ts` 等简短文件名。
`budget.ts` 控制请求取消和等待上限；现有 `lib/server.ts` 等公共模块仍放在原处。
`package.json` 的 `npm test` 同时发现 `lib/*.test.ts` 和 `lib/gasoline-intelligence/*.test.ts`，合并时保留两组测试。
项目仍使用同一份 `package.json`、原有构建配置和测试命令，功能代码直接放在原来的目录体系中。
样式继续使用现有主题色和 Tailwind 工具类。

发布代码统一使用 Google 路线、站点和油价接口以及 Google 地图。旧的开源实现已从运行源码移出，
仅保留在被忽略的 `.local-features/gasoline-intelligence/legacy-openstreetmap/2026-11-15-google-migration/`。
快照保留原路径和 `.disabled` 后缀，`manifest.json` 提供完整性哈希；恢复方法见本地 README。
不要将该目录或旧实现重新加入功能提交。克隆仓库后无需此目录也能构建；回滚需要原机器的本地快照。
旧文件的删除应随本次功能变更提交，不能只靠 `.gitignore` 隐藏已经被跟踪的文件；不重写历史提交。

文档保留范围：`docs/gasoline-intelligence.md`、`docs/google-maps-setup.md`、`docs/deepseek-prompts.md`、
本合并说明和基础接口契约 `docs/api.md` 随源码提交。提示词文档只描述当前车型识别实现，与 `prompts.ts` 同步维护。
`docs/fuel-price-apis.md` 属于个人调研，只在本地保留并由 `.gitignore` 忽略；已跟踪的调研笔记取消跟踪时保留本地文件。
运行源码、功能测试、锁文件、`.env.example` 和原框架文件不应加入忽略列表。

Google 使用两个不同的 key：服务端为 `GOOGLE_MAPS_API_KEY`，浏览器为
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`；可选的 `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` 默认使用本地测试 ID。
真实值只放个人 `.env.local`，不从个人凭据说明文件读取；其他成员需自行配置，不能提交已填写的 key。
浏览器环境变量变动后重启开发服务器，部署前重新构建。

## 与其他模块的接入点

### 登录和用户上下文

- 前端复用 `components/me.tsx` 的 `useMe()` 和旅行区布局中的登录流程。
- 服务端复用 `lib/server.ts` 的 `currentUser()`、`needLogin()` 和 `readJson()`。
- 浏览器请求继续通过 `lib/api.ts` 发起，统一处理 JSON、会话 cookie 和错误信息。
- 查询缓存使用当前登录用户的 `id` 隔离，其他用户无法使用该查询 ID 规划路线。

如果目标分支已接入 Better Auth，应保留目标分支的正式登录实现，再对齐上述公共函数的返回值。
`currentUser()` 需要返回具有稳定 `id` 的用户对象；未登录时返回 `null`。如果其接口发生变化，
主要调整 `lib/gasoline-intelligence/service.ts` 中的适配调用，并同步前端用户上下文。

### 旅行信息

旅行详情入口通过查询参数传递出发地、目的地和旅行开始日期：

```text
/trips/gasoline-intelligence?origin=...&destination=...&startDate=2026-11-27
```

旅行详情使用 `URLSearchParams` 编码参数，`startDate` 直接来自旅行的 `YYYY-MM-DD` 开始日期。
加油模块只选择年月日；停靠时刻按出发后的累计用时展示。加油模块当前不修改旅行、成员或共享行程数据。
搜索及规划结果保存在进程内，搜索有效期为 30 分钟，服务重启后失效。如果后续需要保存规划，
应沿用团队的数据库和 ORM，在服务层增加持久化及旅行成员权限检查。
候选站汇总行右侧的 mi/km 开关同步调整地图、规划和列表的距离；油品后面显示搜索剩余有效时间。
页面底部保留灰色的数据来源及服务说明。车型资料和来源放在默认折叠的浅绿色信息块里，地区油价卡片保持等宽等高。
金额只返回实际加油支出 `purchaseCost` 和单站 `cost`，删除已有燃油估值、总行程及其他费用。
Distance 与 Estimated Duration with Breaks 单独一行，Fuel cost、已用、购买、到达剩余油量四项单独一行。
总用时为 Google 最终途经站点路线的各段驾驶时间之和，加上每站的 `stopMinutes`；绕路驾驶时间已包含，
不重复加算。基础路线和最终途经站点路线均使用 `TRAFFIC_AWARE`，采用 Google 返回的含交通状况的驾驶时长。
请求不指定具体出发时间，以查询时刻出发作为交通估算基准；旅行年月日继续仅用于日期和累计时间展示。
结果不是持续交通监控，刷新交通需重新搜索；旧模式生成的查询不能继续复用。地图 SDK 固定 `language=en&region=US`，不随浏览器语言变化。
无需购买燃油时隐藏零费用和零购买量，显示英文续航提示及实际油量；零绕路信息不显示。
Distance Details 默认收起，车辆详情及地图/卡片的距离折叠统一带动画。
推荐站点使用重新计算的实际道路距离，未规划或待重新计算的站点用 `~` 标记近似距离。
推荐站点采用小卡片和顺序箭头，不显示 Details & sources。Stop preferences 与 Choose your stops 已从发布页面关闭，选站界面、卡片和控制 Hook 已合并为单个 `StopChoices.tsx.disabled`，仅保存在被忽略的 `.local-features/gasoline-intelligence/`。
这些文件使用 `.disabled` 后缀，不参与构建，也不被运行代码导入；不要使用 `git add -f` 上传。
原默认值和服务端偏好/手动选站能力仍保留，克隆代码后不需要该本地目录即可正常构建。
区域价格卡片只汇总 Google 已返回的有效单站报价样本，按路线顺序显示，不代表完整州均价。
页面始终传入 `requireStationPrices:true`，只接受匹配具体美国站点、油品、美元和 72 小时内更新时间的报价。
缺少单站报价时不以区域均价或 $3.50 替代。报价不足会明确返回 `422`，原续航和连续驾驶限制不放宽。
显式 `requireStationPrices:false` 仅为旧 API/本地可选功能保留估算兼容路径。

### 接口路径

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/gasoline-intelligence/vehicle` | 自然语言识别车型，返回可编辑的参数和来源 |
| POST | `/api/gasoline-intelligence/search` | 查询道路路线、候选站和地区油价 |
| POST | `/api/gasoline-intelligence/plan` | 自动推荐，或按照用户选择重新规划 |

请求和响应类型见 `lib/gasoline-intelligence/types.ts`，状态码及字段约定见 `docs/api.md`。
调整接口路径时，应同时修改页面调用、Route Handler 目录及接口文档。

## 容易发生冲突的共享文件

| 文件 | 合并时的处理方式 |
|---|---|
| `app/trips/layout.tsx` | 保留目标分支的登录、用户信息、退出和其他导航，再加入 Gasoline Intelligence 入口；窄屏导航允许换行 |
| `app/trips/[id]/page.tsx` | 保留目标分支的数据加载、权限和行程逻辑，再加入传递 `origin`、`destination`、`startDate` 的入口链接 |
| `package.json` | 沿用团队确定的框架版本和脚本；本模块不再依赖 `leaflet` 或 `@types/leaflet`，Google 地图使用浏览器脚本加载 |
| `package-lock.json` | 先解决 `package.json`，再执行 `npm install --package-lock-only` 生成一致的锁文件，随后运行 `npm ci` 检查 |
| `README.md`、`docs/api.md` | 保留团队其他模块的内容，将本模块的说明合并进去 |
| `.gitignore` | 保留环境文件、本地凭据和 `.local-features/gasoline-intelligence/` 的忽略规则；`.env.example` 作为无密钥的配置模板纳入版本管理 |

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

分支应为 `feature/gasoline-intelligence`。审阅本模块新增文件和共享文件中的修改，再选择性暂存。
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
`feature/gasoline-intelligence` 上进行：

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
3. 车型识别后直接显示 MPG、油箱容量和油品等级；参数完整即可查询并规划，无需勾选确认。
4. Google 地图、站点、区域样本、加油量、费用及到达时间正常显示；未知价格不成为推荐站价；无需加油时显示英文提示。
5. 推荐站点按顺序以箭头连接；偏好和手动选站面板默认不显示。本地可选源码被 Git 忽略，主程序不依赖它们；服务端仍拒绝超出续航或连续驾驶限制的方案。
6. 未登录调用三个新接口返回 `401`，项目代码和提交中没有实际密钥。

## 提交合并请求

检查通过后，仅推送功能分支：

```powershell
git push origin feature/gasoline-intelligence
```

随后创建 Pull Request，比较分支选择 `feature/gasoline-intelligence`，目标分支选择团队确认的分支
（例如 `dev`）。在说明中列出模块入口、共享文件的改动、配置变量和检查结果，
由目标分支维护者完成最终审查及合并。
