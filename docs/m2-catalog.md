# M2：知乎/Moka 真实岗位目录

核验日期：2026-11-18（Asia/Shanghai）。本站生产不使用虚构岗位、静态职位回退或模拟同步回执。

## 已核验公开来源

- 官网入口： https://app.mokahr.com/campus_apply/zhihu/3818
- 官网实际前端脚本：`https://static-ats.mokahr.com/apply-web/javascripts/applyWeb-20260831-1750-7b41e-release.js`。
- 页面公开`init-data`包含org=zhihu、siteId=3818、公开响应解码参数和初始列表。完整读取使用该前端声明的`POST /api/outer/ats-apply/website/jobs`（orgId/siteId/site/limit/offset/needStat）。
- 逐条读取使用同一前端声明的`POST /api/outer/ats-apply/website/job`（orgId/siteId/jobId）。这些POST只读数据，不提交候选人申请。
- 响应是官网前端公开使用的AES-CBC封装；解码参数分别来自本次匿名页面和本次响应。按公开前端相同方式读取，不登录、不取用户Cookie、不请求候选人端点、不破解验证码。
- 新的匿名会话Cookie仅保存在单次同步的内存中，限定同一固定域名和三个已核验路径。拒绝外部跳转、任意来源和请求体传入URL。
- 本次实时读取3条：策略运营实习生、增长运营实习生、推荐算法实习生(27届）。稳定外部ID为官网UUID。公开详情status=open，职位页显示申请入口；未对外提交材料。
- 推荐算法岗位官网栏目为“校招生”，标题包含“实习生(27届）”。两项分别保留；招聘项目仍unknown，27届不擅自转为2027。实习性质不等于暑期实习。

## 后端与存储

新增schema-only迁移`0003_awesome_lorna_dane.sql`：companies、company_sources、recruitment_programs、jobs、catalog_sync_runs、catalog_saved_jobs。目录是公开来源数据，用户收藏通过owner_id隔离并关联已有applications。

recruitment_programs仅在官方项目证据明确时使用；当前不创建伪造的“2027秋招”项目。

同步流程：鉴权/固定来源 → D1租约 → 官网匿名会话 → 全量分页 → 逐条详情 → 完整性与字段校验 → D1事务更新目录/关闭缺失职位/记录成功 → 释放租约。

- 唯一键(source_id,external_job_id)，更新保留first_seen_at；内容哈希仅覆盖规范化公开字段。
- 最多200条、10页，单响应2MiB，网络读取总预算50秒；单次请求最多10秒；并发租约120秒，成功后60秒冷却。
- 任一列表/详情读取失败、重复分页、总数变化或字段不一致，整次失败，旧目录不被清空。只有完整成功才按缺失标记关闭；所有更新在同一D1批处理内并检查租约。
- 24小时未核验的开放职位在查询时标为stale。批次、完整毕业年份、截止时间未知时保留未知。
- CATALOG_ADMIN_USER_ID通过Sites运行时秘密配置；匿名401、其他登录身份不可触发同步（403）。目录查询需登录，收藏只影响本人。
- 收藏幂等建立状态saved的申请，applied_at为空；不执行官网提交。

## API

| 方法 | 路径 | 契约 |
|---|---|---|
| GET | /api/companies | 真实来源状态、最近成功/失败、canSync和同步运行摘要 |
| GET | /api/jobs | q/companyId/city/programKind/employmentType/graduationYear/availability/limit/cursor；items、nextCursor、sourceHealth |
| GET | /api/jobs/{id} | JD纯文本、官方链接、原始分类、核验时间、开放证据、本人收藏关联 |
| POST | /api/catalog/sources/zhihu-moka-campus/sync | 无请求体，管理员限定；成功返回runId/state/seenCount/时间，失败不冒充零岗位 |
| GET | /api/catalog/sync-runs/{id} | 实际运行结果和安全错误信息 |
| POST | /api/jobs/{id}/save | 幂等加入本人待投递，返回applicationId |

查询使用参数化SQL；关键词按字面子串匹配，不将%/_作为通配符。分页按稳定目录ID排序，不声称按发布时间排序。原始HTML转为纯文本，前端不执行官网HTML。

## 前端

首页“发现岗位”：来源卡与手动同步、关键词、公司/城市/招聘项目/性质/毕业年份/有效性筛选；职位详情Sheet、官网原文、加入待投递。

未同步、同步失败、官网确实零条、筛选零条分开提示。来源当前仅知乎；列表不声称覆盖全部互联网公司，不将任何实习自动标为暑期项目。

## 验证

- `npm test`：适配器公开封装解码、来源身份、时间/分类保守解析、HTML处理、固定路径/跳转约束、分页完整性、实际SQLite/D1事务upsert与租约防护。
- `npm run build`后`npm run test:m2:live`：实际workerd/D1 SQLite/R2集成运行，网络实时读取官网，不使用录制响应作为生产数据；覆盖M1回归和M2同步、筛选分页、详情、管理员权限、收藏幂等和双身份隔离。
- 最终生产部署/同步与UI核对见根目录`docs/10-m2-delivery.md`。

首版按需同步，不建立未经请求的定时自动化。官网格式或访问条件变化会明确失败，保留旧数据及核对时间。
