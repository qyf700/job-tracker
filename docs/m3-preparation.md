# M3 投递准备与确认契约

范围：真实岗位、原件和资料版本选择，服务器缺项检查，官网只读复核，预览，明确确认，不可变快照，等待连接器任务及取消。没有官网提交动作、假回执或模拟执行器。

## 流程与边界

每个用户/岗位一份可编辑准备单，CAS版本号保护。修改材料会使旧预览失效，并取消尚未执行的旧任务；已有快照不修改。

服务器从私有数据库读取实际版本，不信任客户端姓名/哈希/对象键。预览有效期10分钟，绑定准备单版本、岗位内容哈希和字段规则版本。预览与确认均实时只读复核官网目标岗位；闭岗、目录内容变化、原件归档/缺失、过期预览或并发修改均阻止确认。

确认必须携带服务端预览ID、精确内容哈希和明确acknowledged=true。确认原子保存不可变材料快照、个人待投递申请和needs_connector任务；同一预览重复点击返回同一快照/任务，绝不创建外部申请。

本轮仅为已核验的知乎推荐算法岗位启用规则（官网UUID 276cde6c-124e-4059-b656-3d2636317338）。其他岗位可保存准备单，但确认被“表单尚未核验”阻止，不能把一个岗位的规则冒充全部Moka表单。

## 字段与校验

2026-11-18重新查看公开申请表：毕业时间、是否可以实习、招聘信息来源、期望城市、教育经历就读时间/学校/专业/学历有必填标记；实习选项是/否；来源选项原文在代码策略中记录。

工具另要求原件、姓名、有效手机和邮箱，明确标记为工具准备要求，不冒充官网星号。至少一段完整教育经历；已添加经历逐条校验年月顺序。

实习/招聘来源可以为当前岗位单独填写；未填时仅复用所选资料中与官网选项精确匹配的值，不猜选项。其他来源说明作为工具准备校验单独标识。官网照片/其他附件必填性尚未确认，作为后续本人核对项，不伪称已支持附件上传。

官网登录、验证码、隐私协议和最终提交必须后续本人/真实连接器处理；工具确认框不是官网隐私协议同意。资格与岗位条件由本人复核，不用资料完整性替代录用资格。

## 存储

- submission_preparations：id,owner_id,job_id,resume_id,profile_version_id,answers_json,version,state,last_snapshot_id,created_at,updated_at，唯一(owner_id,job_id)。
- submission_previews：id,owner_id,preparation_id,preparation_version,data_json,content_hash,expires_at,created_at。只追加，过期不可确认。
- material_snapshots：id（等于预览ID，幂等键）、owner_id、preparation_id、data_json、content_hash、confirmed_at。SQL触发器阻止UPDATE/DELETE。
- submission_tasks：id,snapshot_id,owner_id,preparation_id,application_id,state,version,created_at,updated_at。当前仅needs_connector→cancelled，无任意状态PATCH。
- submission_events：稳定事件ID、归属、任务ID、动作、时间，只追加，SQL触发器阻止改删。

快照正文冻结公司/岗位/JD/官网域名、来源内容哈希、原件名称/大小/SHA256与私有不可覆盖对象键、指定资料版本完整正文、实际答案、规则证据和待处理事项。原件沿用M1不可覆盖且归档不删除的私有R2对象；确认前实际读取字节校验哈希，快照下载按快照归属与冻结键提供。API不公开对象键。

## API

- GET/POST /api/preparations：列表；按jobId幂等创建空准备单。
- GET/PUT /api/preparations/{id}：读取；用version保存resumeId/profileVersionId/answers，其他属性拒绝。
- POST /api/preparations/{id}/preview：提交version，重新读取和校验材料/官网，返回缺项或有时效的服务端预览。
- POST /api/preparations/{id}/confirm：previewId/contentHash/acknowledged=true，CAS确认。
- GET /api/submissions：本人已确认任务。
- GET /api/submissions/{id}：冻结快照及任务/事件；不动态替换旧资料。
- GET /api/submissions/{id}/file：按冻结原件受保护下载，支持Range。
- POST /api/submissions/{id}/cancel：用version取消needs_connector任务，保留快照与审计。

以上均需要登录；跨用户对象404、匿名401，字段错误422、版本/预览/材料变化409。

## 验收

缺项/非法选项阻止；真实岗位复核；幂等创建和确认；篡改/过期/旧版本拒绝；任务不能伪迁移到submitted；更新资料、归档原件不改变历史正文和下载字节；双身份隔离；SQL快照不可修改；真实构建/存储/网络集成；生产部署与缺项阻止验收。不使用虚构候选人向企业投递。

快照正文最多1MiB；已有申请不在saved阶段、已有applied_at或已归档时阻止新确认任务，并在确认事务中再次检查，避免已投岗位重新排队。

## 开发验收记录

2026-11-18：TypeScript与生产构建通过；22项单元/约束测试通过；182项实际HTTP集成检查通过（含M1/M2回归）。集成使用实际workerd、D1 SQLite、R2，实时只读核验知乎岗位。验证缺项、版本冲突、跨账号访问、过期/改动/篡改预览、并发同预览确认幂等、确认后改资料/归档文件仍能核对冻结正文与下载哈希、材料变化取消旧任务、手动取消，以及已投岗位不得新建确认任务。没有对外申请，也没有生产mock分支。

生产上线及UI验收另见仓库根目录docs/11-m3-delivery.md。生产当前缺少真实求职资料时只验证缺项拦截，不填虚构候选人资料来冒充真实正式投递。
