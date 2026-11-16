# Google Maps 配置步骤

本功能使用 Routes API 计算路线，Places API (New) 返回单站油价，Maps JavaScript API 展示地图。
DeepSeek 继续识别车型；选择 Google 后，路线和油价查询不经过 DeepSeek 网页研究。

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

在「API 和服务 → 凭据 → 创建凭据 → API 密钥」创建以下两项：

| Key 用途 | 应用限制 | API 限制 |
| --- | --- | --- |
| 服务端查询 | 本地开发没有固定出口 IP 时暂不设 IP 限制；部署后限制为服务端出口 IP | 仅 Routes API、Places API (New) |
| 浏览器地图 | 网站（HTTP 引荐来源），添加下面两个本地地址 | 仅 Maps JavaScript API |

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

打开项目根目录 `.env.local`，保留已有 DeepSeek 配置，增加以下内容，将占位文字换成真实 key：

```dotenv
FUEL_DATA_PROVIDER=google
GOOGLE_MAPS_API_KEY=你的服务端key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=你的浏览器key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

`DEMO_MAP_ID` 可用于本地测试 Advanced Markers，无需先建立自己的 Map ID。
正式部署时可在「Google Maps Platform → 地图管理」创建 JavaScript 类型的 Map ID，替换该值。
`.env.local` 已被 Git 忽略，不要提交，也不要把 key 贴到聊天或截图里。
`.env.example` 仅包含空变量，可正常提交。

`FUEL_DATA_PROVIDER=google` 会明确选择 Google；缺少配置时在付费查询前报错。
`auto` 在服务端 key 未配置时保留原流程，配置后使用 Google。
`openstreetmap` 明确选择原流程；原来的 `FUEL_STATION_PROVIDER=web` 只影响原流程，不覆盖 Google 设置。

## 4. 重启并检查

停止旧的 dev 进程，再运行：

```powershell
npm run dev
```

登录后进入 Gasoline Intelligence，先用 Tahlequah, OK → Urbana, IL 测试。
地图应切换为 Google 地图；油价应来自该站对应油品的 `fuelOptions`，地图预览与推荐卡片使用同一份价格。
没有价格、油品不符或报价超过 72 小时的站点仍显示无报价，不用州均价替代。
如果没有足够报价支持安全行程，仍会提示无法规划；这属于数据覆盖限制，不保证开通 API 后每条路线都有报价。

修改 `NEXT_PUBLIC_` 变量后必须重启开发服务器；正式构建后修改需要重新构建。
出现 `403` 时，依次检查结算、三个 API 是否启用、key 的 API 限制，以及浏览器网站限制。
不要将服务端 key 换成网站限制的 key。

## 5. 额度与调用数量

核对日期：2026-11-15。`fuelOptions` 是 Places **Enterprise + Atmosphere** 档位字段，
不是仅开启基础地点查询就免费的字段。当前全球按量计费表中，Text Search 该档位每月有 1,000 次免费调用，
超出后首档为每 1,000 次 $40；每次搜索可返回多个站点。
Routes Compute Routes Essentials 每月 10,000 次免费，超出后首档每 1,000 次 $5；
Dynamic Maps 每月 10,000 次免费加载，超出后首档每 1,000 次 $7。
途经点较多等请求可能触发更高的 Routes 档位。
[字段计费档位](https://developers.google.com/maps/documentation/places/web-service/data-fields)、
[官方价目表](https://developers.google.com/maps/billing-and-pricing/pricing)、
[Routes 计费规则](https://developers.google.com/maps/documentation/routes/usage-and-billing)。

当前实现每次路线搜索请求 1 次 Routes，按路程长度并行请求 1–3 次 Places Text Search，每次最多返回 20 站；
生成有停靠点的最终方案再请求 1 次 Routes。没有逐站 Details 请求、自动翻页、失败自动重试或 DeepSeek 油价研究。
用户主动再次搜索会重新请求；同一个搜索中的已生成方案可在有效期内直接复用。

可先在「结算 → 预算和提醒」设置小额预算提醒，再在各 API 的「配额」页面降低可修改的调用配额。
预算提醒不是硬性消费上限。Cloud 试用额度是否适用、剩余额度和到期日，以该结算账户实际显示为准。
更多供应商与价格比较见 [fuel-price-apis.md](fuel-price-apis.md)。

Google 模式不将站点数据绘制到 OSM 地图；Google 标识与返回的第三方署名保留在地图中。
查询结果只服务当前登录用户的临时行程，不写入持久站点数据库或跨用户报价研究缓存。
