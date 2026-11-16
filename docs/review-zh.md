# Shared lobby 审查与交付

## 交付位置

- 分支：`feature/shared-lobby-postgres`
- 工作目录：`/home/shulan/projects/homework/409/triptogether-lobby`
- HEAD：干净 dev `9b6339f841369ee86de0c6b5da1ff43cc8c868fd`，没有新增提交。
- 原工作区、远程 dev 都没有改动。没有 commit、push 或 PR。

功能仍以已确认的版本为准：申请加入旅行、任意现有成员审核、通过后加入旅行群聊、多个旅行、
卡片上的申请历史、撤回/拒绝重试、帖子同步、发布者下架、地名比较和服务端筛选排序。

## 不改其他业务模块

`npm run check:scope` 检查 40 个基础文件与干净 dev 字节一致：登录、基础旅行 API、共享会话、
TripForm、TripSign、Itinerary、全局样式、首页和 Your trips 页面均保留原样。
“Go to the shared lobby” 是之前新增到 Your trips 的按钮，现在已去掉。
仅保留两个功能 2 入口：顶部大厅导航、旅行页的群聊入口；没有改这两个页面的业务规则。
README 的原始技术栈表没有被改写成其他技术。依赖、共享类型和校验只作大厅所需的增量。

## 技术栈与集成边界

本模块使用 Next.js 16 / React 19 / TypeScript / Tailwind v4 / Next API routes /
PostgreSQL / Drizzle ORM / drizzle-kit。运行数据只保存在 PostgreSQL。
只创建 shared_lobby_posts、shared_lobby_requests、shared_lobby_messages 三张模块表，
以及独立的 shared_lobby_migrations 迁移记录，不修改团队账号、旅行或成员表结构。

按用户明确选择，Better Auth、共享账号、旅行后端由组长统一接入。
`lib/lobby-backend.config.ts` 留有明确的适配点，未配置时相关接口返回 503；不会偷偷启用另一套
登录系统或内存业务存储。因此这是已验证的模块交付，不代表整个团队应用已经完成集成。
适配合同和原子接受要求见 `docs/lobby-integration.md`。
测试夹具位于 `tests/fixtures`，只被测试导入，不会进入应用路由。

## 样式预览

本地隔离集成预览：http://localhost:3002/trips/lobby
Maya：maya@example.com；Sam：sam@example.com；密码均为 roadtrip1。
预览使用以前隔离的 PostgreSQL 基础后端来演示完整流程，不是要合并的共享后端代码。
正式交付只看 triptogether-lobby 目录；不要把预览目录 triptogether-postgres 的共享模块一起合并。

## 验证

- 140 项模块/数据库测试通过，测试使用独立 PostgreSQL 数据库与测试专用共享后端。
- 范围检查、类型检查、ESLint、生产构建通过。
- 在配置了适配器的隔离预览中检查申请、审核、聊天、退出权限、多旅行、筛选和 390px 手机布局。
- 测试发现并修复筛选隐藏自己帖子后，发布表单重复提供已发布旅行的问题。
- 浏览器测试等待真实审核响应，避免点击后立即检查产生竞争误判。
- 组长接入真实共享后端后仍需再跑完整浏览器验收；不能承诺没有任何未知问题。


## 大厅样式与隐私更新

页头改为浅色紧凑标题，搜索/日期/排序统一成轻量工具栏；卡片以路线层次同时展示出发地与目的地。
成员、发布者与申请人姓名不在大厅展示，申请以独立编号识别；HTTP 响应同时脱敏，移除私聊预览。
隐私投影有单元回归测试，浏览器检查覆盖实际卡片、接口数据与手机筛选布局。


## 空库系统检查与排序修复

仅清空并检查了隔离预览数据库 triptogether（Docker 项目 triptogether-current，55433），原项目数据未动。
日期筛选使用固定英文自定义日历及 YYYY-MM-DD 输入，避免原生控件跟随系统显示“日”。
非法日期和反向范围由服务器拒绝；排序说明随选项同步。
排序规则：closest 先未结束、再日期重叠、再相似度、再出发日与稳定 ID；
soonest 先未结束、再出发日、返回日、稳定 ID；soonest-end 先未结束、再返回日、出发日、稳定 ID。
144 项测试通过；浏览器比较每一种排序的 HTTP 与卡片顺序，覆盖日期不重叠、已结束与多行程。
原有 decline、regress、lobby、manual 验收全部通过。检查完再次清空预览业务数据，供用户重新注册开始检查。
所有基础 dev 模块保持原样，共享后端由组长接入的边界不变。
## 申请提醒

登录后，Shared lobby 导航显示服务端授权的待处理申请数量，其他旅行页面也会约每 5 秒更新。
新申请增加时显示短暂站内提示；大厅顶部保留待处理提示，点击 Review requests 会清空筛选并定位旅行。
接受、拒绝、撤回或下架后数量自动更新；申请人不会收到自己申请的审核提醒。
提醒只在网页内工作，不依赖浏览器系统通知授权。没有新建第二套申请接口或修改基础模块。

