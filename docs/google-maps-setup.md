# Google Maps 配置步骤

本功能使用 Routes API 计算路线，Places API (New) 返回单站油价，Maps JavaScript API 展示地图。
DeepSeek 只识别车型；路线和油价查询不经过 DeepSeek 网页研究。当前版本只有 Google 实现，缺少配置时不会自动切换其他服务。

## 1. 选择项目并启用 API

打开 [Google Cloud Console](https://console.cloud.google.com/)，选择要用于本项目的 Cloud 项目。
在「结算」确认该项目关联了你有额度的结算账户。即使只使用免费额度，也需要关联结算账户。
在「API 和服务 → 库」分别搜索并启用：

- **Routes API**
- **Places API (New)**，不是旧版 Places API
- **Maps JavaScript API**

API 启用和 key 限制变更可能需要几分钟生效。
[官方开通说明](https://developers.google.com/maps/documentation/places/web-service/get-api-key)。

## 2. 创建两个不同的 key

在「Keys & Credentials」顶部选择 **Create credentials → API key**，分别创建以下两项。
浏览器 key 可命名为 `TripTogether Browser`，创建后点击名称进入编辑页面：

| Key 用途 | 应用限制 | API 限制 |
| --- | --- | --- |
| 服务端查询 | 本地开发没有固定出口 IP 时暂不设 IP 限制；部署后限制为服务端出口 IP | 仅 Routes API、Places API (New) |
| 浏览器地图 | 网站（HTTP 引荐来源），添加下面两个本地地址 | 仅 Maps JavaScript API |

浏览器 key 的 **Application restrictions** 选择 **Websites**，**API restrictions** 选择
**Restrict key**，仅勾选 **Maps JavaScript API** 后保存。API key 登录方式无需配置 OAuth consent screen。

浏览器 key 的允许网站：

```text
http://localhost:3000/*
http://127.0.0.1:3000/*
```

如果运行在其他端口，添加该端口的完整地址；部署后添加实际域名。
服务端 key 不要设置「网站」限制，因为服务端 REST 请求不带浏览器引荐来源。
浏览器 key 会发送到浏览器，因此必须限制网站与 API；服务端 key 不得放入任何 `NEXT_PUBLIC_` 变量。
[官方 key 限制建议](https://developers.google.com/maps/api-security-best-practices)。

## 3. 填写本地环境变量

首次配置时复制 `.env.example` 为项目根目录的 `.env.local`；已有该文件时只补充缺失变量，
不要覆盖已有 DeepSeek 或其他模块配置。分别填写两个不同的 key：

```dotenv
GOOGLE_MAPS_API_KEY=你的服务端key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=你的浏览器key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

`DEMO_MAP_ID` 可用于本地测试 Advanced Markers，无需先建立自己的 Map ID。
正式部署时可在「Google Maps Platform → 地图管理」创建 JavaScript 类型的 Map ID，替换该值。
`.env.local` 已被 Git 忽略，不要提交，也不要把 key 贴到聊天或截图里。
`.env.example` 仅包含空变量，可正常提交。

服务端和浏览器 key 都配置后才能进行完整查询。服务端 key 需要同时允许 Routes 和 Places API (New)，
浏览器 key 仅允许 Maps JavaScript API，并限制网站来源。程序不会把服务端 key 自动复制到浏览器变量。
应用只从环境变量读取 key；`basic_info.md` 等个人凭据笔记不会由运行中的应用自动加载，
也不应提交到仓库。修改笔记后，仍需将对应值更新到 `.env.local`。
旧的数据源开关和端点变量不再使用；开源地图和网页查价实现已移到本地忽略目录，仅供手动回滚。

## 4. 重启并检查

停止旧的 dev 进程，再运行：

```powershell
npm run dev
```

登录后进入 Route planner，先用 Tahlequah, OK → Urbana, IL 测试。
地图应切换为 Google 地图；油价应来自该站对应油品的 `fuelOptions`，地图预览与推荐卡片使用同一份价格。
没有价格、油品不符或报价超过 72 小时的站点仍显示无报价，不用州均价替代。
如果没有足够报价支持安全行程，仍会提示无法规划；这属于数据覆盖限制，不保证开通 API 后每条路线都有报价。

修改 `NEXT_PUBLIC_` 变量后必须重启开发服务器；正式构建后修改需要重新构建。
出现 `403` 时，依次检查结算、三个 API 是否启用、key 的 API 限制，以及浏览器网站限制。
不要将服务端 key 换成网站限制的 key。

## 5. 额度与调用数量

核对日期：2026-11-15。`fuelOptions` 是 Places **Enterprise + Atmosphere** 档位字段，
不是仅开启基础地点查询就免费的字段。当前实现用的是 Nearby Search 的这一档位，免费额度和单价以下方官方价目表为准；每次请求最多返回 20 个站点。
路线已启用 `TRAFFIC_AWARE`，使用 **Routes Compute Routes Pro**：每月 5,000 次免费，超出后首档每 1,000 次 $10；
Dynamic Maps 每月 10,000 次免费加载，超出后首档每 1,000 次 $7。
当前每次路线请求首档单价约 $0.01；有停靠点时两次请求约 $0.02，免费额度内仍按相应额度抵扣。
交通估算以查询时刻出发为基准；出发日期栏保留年月日，不额外假设具体出发时间。结果不会自动轮询更新。
[字段计费档位](https://developers.google.com/maps/documentation/places/web-service/data-fields)、
[官方价目表](https://developers.google.com/maps/billing-and-pricing/pricing)、
[Routes 计费规则](https://developers.google.com/maps/documentation/routes/usage-and-billing)。

当前实现每次路线搜索请求 1 次 Routes，再沿路线走廊并行请求 Places Nearby Search：路程每 `1.5 × FUEL_CORRIDOR_MILES` 英里一次，
最多 `FUEL_MAX_STATION_SEARCHES` 次（默认 10），每次最多返回 20 站。生成有停靠点的最终方案再请求 1 次 Routes；
真实路段超出油量时会重新选站并再请求，最多 3 次。没有逐站 Details 请求、自动翻页或 DeepSeek 油价研究。
用户主动再次搜索会重新请求；同一个搜索中的已生成方案可在有效期内直接复用。

可先在「结算 → 预算和提醒」设置小额预算提醒，再在各 API 的「配额」页面降低可修改的调用配额。
预算提醒不是硬性消费上限。Cloud 试用额度是否适用、剩余额度和到期日，以该结算账户实际显示为准。
历史供应商与费用调研只在本地保留，未纳入发布仓库；当前服务计费以以上官方链接为准。

Google 标识与返回的第三方署名保留在地图中，不与非 Google 地图混合。
查询结果只服务当前登录用户的临时行程，不写入持久站点数据库或跨用户报价研究缓存。
请求只包含路线、站点身份和地址、对应油品报价、地图链接及必要署名；不查询餐厅、厕所、营业时间、评论或照片。
