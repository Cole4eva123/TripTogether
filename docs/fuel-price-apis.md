# 单站油价 API 与路线服务选择

核对日期：2026-11-15。以下价格为美元，采用官方全球按量计费价目表；额度按 SKU 分别计算，每月重置。

## 当前为什么查不到单站报价

原流程使用 DeepSeek 的联网搜索/提取，不是直接连接加油站报价数据库。公开页面可能没有价格、
没有观察日期、缺少指定油品，或者地址与该站不一致。代码还要求引用匹配、地址和油品匹配、
报价在最近 72 小时内，因此证据不足时返回 unknown，不会把州均价或默认估算价当成该站油价。
短超时提高响应速度，但也可能减少查到的有效报价。区域统计 API（例如 EIA）不能解决单站报价覆盖问题。

## 优先考虑 Google Places API (New)

官方提供 `fuelOptions.fuelPrices[]`，包括油品 `type`、金额 `price` 和 `updateTime`。
美国价格按 US gallon；它是最后已知的单站报价，不保证每站有数据或与此刻油泵完全同步。
可通过 Place Details、Nearby Search 或 Text Search 请求；只请求需要的字段，先对实际路线站点抽样验证覆盖。
[字段定义](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#FuelOptions)、
[字段对应计费档位](https://developers.google.com/maps/documentation/places/web-service/data-fields)。

需要注册 Google Cloud，建立项目并启用结算，开启 Places API (New) 后创建 API key；
Routes 和地图显示分别启用 Routes API、Maps JavaScript API。不需要先购买固定套餐，按使用量收费，
即使计划只用免费额度也需要开通结算。[注册与开通说明](https://developers.google.com/maps/documentation/places/web-service/get-api-key)。

| 用途 / SKU | 每月免费额度 | 超额度后首档，每 1,000 次 |
|---|---:|---:|
| Routes Compute Routes Essentials | 10,000 | $5 |
| Routes Compute Routes Pro | 5,000 | $10 |
| Routes Compute Routes Enterprise | 1,000 | $15 |
| Places Place Details Enterprise + Atmosphere（含 fuelOptions） | 1,000 | $25 |
| Places Nearby / Text Search Enterprise + Atmosphere | 各 1,000 | $40 |
| Dynamic Maps（网页交互地图加载） | 10,000 | $7 |

来源：[Google 官方价目表](https://developers.google.com/maps/billing-and-pricing/pricing)。
路线 API 负责路线和路程时间，单站油价来自 Places，不能只开 Routes 就得到油价。
实时交通、途经点优化或超过十个途经点等请求可能使用更高的路线计费档位。
[Routes 计费规则](https://developers.google.com/maps/documentation/routes/usage-and-billing)。

只计算油价详情这一项：每月 100 条路线、每条查 16 站，共 1,600 次 Details；扣除 1,000 次免费额度后，
约 $15，另计搜索、路线和地图等实际用量。若搜索响应直接带回多个站的 fuelOptions，可减少逐站 Details 调用；
需按具体请求方案计算，而不能把每个站都重复查一次。

当前已加入 Google 模式，使用 Google 地图展示 Google Places 结果；原流程保留 Leaflet / OpenStreetMap。
Google Places 结果若显示在地图上，官方要求使用 Google Map，不将这些站点绘制到 OSM 地图。
[Places 展示政策](https://developers.google.com/maps/documentation/places/web-service/policies)。

## TomTom Fuel Prices API

提供单站分油品报价，美国在覆盖名单内。API 每十分钟刷新，但实际站价更新频率受站点和数据提供方影响。
当前文档注明 Automotive only，且不包含在免费试用或自助 PAYG 中：需要注册开发者账户，联系销售申请访问和报价，
不能假设普通免费 key 即可调用。对课程项目而言，先核实授权和合同价格再决定。
[产品与访问要求](https://docs.tomtom.com/fuel-prices-api/documentation/product-information/introduction)、
[覆盖市场](https://docs.tomtom.com/fuel-prices-api/documentation/product-information/market-coverage)。

## 对当前项目的建议

按 [Google Maps 配置步骤](google-maps-setup.md) 设置后，先测试 Tahlequah–Urbana 路线的 fuelOptions 覆盖和更新时间。
Google 模式每次搜索使用 1 次 Routes 和最多 3 次并行 Text Search，直接取得多个站点报价，最终方案再使用 1 次 Routes；
没有逐站 Details 查询。DeepSeek 继续做车型识别，避免每次推荐都多轮搜索油价。
暂时不注册结算账户时，可保留 OSM 路线和有来源的站价搜索，但必须接受部分站点无报价；
也可增加人工录入已确认站价作为低预算演示方案，明确标明数据时间和录入来源。
