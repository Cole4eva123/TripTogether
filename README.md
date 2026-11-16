# TripTogether

TripTogether 是一个面向小组出行的旅行规划 Web 应用：从建团、邀请成员、按天排行程，到路线规划（全程加油花费最低）、寻找同行小组、抽奖盒行程和旅途中的任务 Bingo，帮助一群人把旅行从计划到完成都一起搞定。

## 技术栈

| 部分 | 选择 | 现状 |
|---|---|---|
| 框架 | Next.js 16（App Router）+ React 19 | 在用 |
| 语言 | TypeScript | 在用 |
| 样式 | Tailwind CSS v4 | 在用 |
| 后端 | Next.js API 路由（`app/api/`），接口契约见 `docs/` 各功能文档 | 在用 |
| 数据库 | PostgreSQL，本地用 Apple `container`（或 Docker）运行，见 `docs/database.md` | 在用 |
| ORM | Drizzle ORM，迁移用 drizzle-kit | 在用 |
| 登录 | Better Auth（邮箱 + 密码，接 Drizzle） | 在用 |
| 测试 | Node 自带的 `node:test` | 在用 |
| 代码检查 | ESLint | 在用 |
| 包管理 | npm | 在用 |

- 部署暂不考虑，先在本地跑通。
- 路线规划使用 Google Routes、Places API (New) 的单站油价和 Google 地图，按调用次数计费；DeepSeek 只用来识别车型。图片存储等其他服务待定。
- 地名来自仓库自带的 GeoNames 地名库（1.5 万人口以上的城市），不依赖外部服务。

## 本地运行

1. `npm ci`
2. 把 `.env.example` 复制为 `.env.local` 并填写。数据库和登录的配置见 [`docs/database.md`](docs/database.md)；路线规划需要的三个 key 和 `FUEL_*` 设置见 [`docs/route-planner.md`](docs/route-planner.md)，申请步骤见 [`docs/google-maps-setup.md`](docs/google-maps-setup.md)。不填 Google key 时其余功能照常可用。
3. `npm run dev`，打开 http://localhost:3000
4. `sh scripts/seed.sh http://localhost:3000` 可写入演示用户和旅行

检查：`npm test`、`npm run lint`、`npm run typecheck`。

## 基础模块

### 用户注册与登录
- 注册、登录、退出

### 旅行管理
- 创建、查看、修改、删除旅行
- 填写出发地、目的地和日期；出发地和目的地从候选列表里选，不能自由填写，统一保存为完整名称（如 "Chicago, Illinois"）

### 成员邀请
- 通过邀请码加入旅行
- 查看成员列表
- 退出旅行

### 行程规划
- 按天查看旅行的完整行程，每天一站
- 所有成员都可以给某一天添加、修改、删除安排：时间（可不填）、做什么、地点、备注
- 每条安排显示是谁添加的；同一天内，没定时间的排在前面，其余按时间排序
- 旅行日期改短后，落在日期之外的安排会单独标出，提醒挪到行程内的某天或删除

## 创新功能

### 1. 路线规划（Route planner）
- **入口**：页头的 **Route planner**，或旅行详情页的 **Plan fuel stops**（会带上该旅行的出发地、目的地和日期），地址 `/trips/route-planner`
- **输入**：出发地和目的地（从列表里选）、车辆油耗、油箱容量、油品、当前油量和保留油量
- **数据**：以最快路线为中心线，查询两侧走廊内的加油站和它们的实时油价；按州汇总沿途的油价样本
- **规划**：在这些加油站里精确求出全程加油花费最少的方案，也就是在哪几站加、每站加多少。绕路多烧的油计入花费；停靠只为加油，某一段驾驶过长时只给提醒
- **展示**：路线、候选站和选中的站显示在地图上，并列出每站的加油量和费用
- **AI**：DeepSeek 根据一句描述识别车型的油耗和油箱容量；路线和选站由服务端规划器计算，不经过 AI

设计、配置和接口见 [`docs/route-planner.md`](docs/route-planner.md)，车型识别的提示词见 [`docs/deepseek-prompts.md`](docs/deepseek-prompts.md)。

### 2. 旅行小组匹配
- 小组定好大致旅行计划后，可发布到「共享大厅」
- 其他小组发现行程相近（目的地、日期等相似）时可发起匹配
- 对方同意后双方开启聊天，商量是否结伴

设计和接口见 [`docs/lobby.md`](docs/lobby.md)。

### 3. 旅行抽奖盒（Lottery box）
- 用户设置目的地、预算、可用时间和活动偏好
- 系统从符合条件的候选景点、餐厅或活动中随机抽取，生成「神秘行程」
- 团队成员可各自提交隐藏选项，抽取后统一揭晓，给选择困难的小组增加惊喜和趣味

本地版本已实现：从旅行详情页点击 **Open travel lottery box** 进入。组织者设置条件并揭晓，成员可提交
保密选项，抽取后可将结果一次性加入原行程。内置 Chicago、New York、San Francisco 演示候选，其他目的地
可通过成员提交使用；费用按每人 USD 估算，不含交通费。数据保存在 PostgreSQL 中。
设计、接口和验证步骤见 [`docs/lottery-box.md`](docs/lottery-box.md)。

### 4. 旅行任务 Bingo
- 每个城市维护一个任务库（城市从列表里选），存放当地可以做的事（例如芝加哥：去海军码头看日出、晚上去某栋楼的楼顶看夜景、拍一张全组合照）
- 小组出发前生成一张 Bingo 卡，旅行中完成任务即打卡，连成一线即完成 Bingo
- 任务由用户上传，经 app 审核后加入任务库

设计和接口见 [`docs/bingo.md`](docs/bingo.md)，角色和权限见 [`docs/roles.md`](docs/roles.md)。
