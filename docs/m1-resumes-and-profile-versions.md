# M1：简历原件与资料版本

本模块范围：真实 PDF 上传/下载/预览、不可覆盖原件版本、默认简历、可恢复归档、文字提取，以及结构化资料的不可变历史与恢复。首版仅 PDF，单文件最多 5 MiB；不做 OCR、AI 改写或对外投递。

## 数据与存储

- `resume_assets`：id（客户端 UUID，兼作重试标识）、owner_id、label、original_name、mime_type、size_bytes、sha256、object_key、upload_status、upload_error、extraction_status、extraction_text、extraction_error、page_count、version、created_at、archived_at。
- 原件位于私有 R2 `BUCKET`，对象键由服务端用用户ID和UUID生成；不使用上传文件名拼接存储路径，不公开对象URL。原件写入一次，禁止同ID换内容。同一字节内容允许上传为不同命名版本。
- 上传状态：uploading → ready / upload_failed；相同UUID和相同元信息可重试，UUID复用但内容不同返回409。D1先记录上传事务，R2成功后再标ready；只有ready且未归档的文件可设默认或作为新资料版本来源。
- `material_settings`：owner_id、default_resume_id、version、updated_at。默认选择独立于文件内容，使用乐观锁；归档当前默认文件时在D1同一事务清空默认，不擅自改选其他文件。
- `profile_versions`：id、owner_id、revision、label、data_json、source_resume_id、change_kind（manual/restore/legacy）、restored_from_id、created_at。唯一键(owner_id, revision)。快照正文不修改、不删除。
- 现有 `profiles` 继续作为当前投影；每次保存与新增快照在同一事务提交。旧版已有资料在下一次保存前保留为legacy快照，不在schema迁移中写入用户数据。
- 恢复历史资料不是回滚版本号，而是复制历史内容创建新revision；默认简历不随资料恢复被暗中修改。历史资料关联原件被归档后仍可查看原件。

## API

均为登录后私有端点；忽略客户端用户归属字段，按服务端身份校验每个对象。

| 方法/路径 | 入参 | 返回/规则 |
|---|---|---|
| GET /api/resumes | archived=0/1 | 文件元信息、默认ID与设置版本；不返回R2对象键或文件正文 |
| POST /api/resumes | multipart id,label,file | 201新文件；同请求重试200；413超限、415非PDF、409标识冲突 |
| GET /api/resumes/{id} | 无 | 元信息、提取文本与待确认联系方式 |
| GET /api/resumes/{id}/file | disposition=inline/attachment | 私有PDF流，支持单Range请求；归档原件仍可鉴权下载 |
| POST /api/resumes/{id}/extract | 无 | 仅文字提取，最多20页；失败原件保留，不声称成功解析 |
| POST /api/resumes/{id}/archive | version | 可恢复归档，原件不删除；清理默认引用 |
| POST /api/resumes/{id}/restore | version | 恢复到列表，不自动设默认 |
| PUT /api/material-settings | version,defaultResumeId|null | CAS更新；文件必须属于本人且ready/未归档 |
| GET /api/profile | 无 | 保留现有契约，增加currentVersionId/sourceResumeId |
| PUT /api/profile | data,version,label?,sourceResumeId? | CAS保存当前资料并追加快照，409不得覆盖他人/另一标签页修改 |
| GET /api/profile-versions | 无 | 历史元信息、当前revision、旧资料待保留提示 |
| GET /api/profile-versions/{id} | 无 | 只读资料快照和来源文件元信息 |
| POST /api/profile-versions/{id}/restore | version | 复制为新版本，保留恢复来源与全部旧快照 |

## 文件与提取边界

流式读取multipart时先限制总请求体；校验扩展名、PDF头部/结束标记、实际大小。文件名仅作显示，过滤路径和控制字符。内容SHA256在服务端计算，下载响应提供已存哈希。

提取使用本进程PDF解析库，无外部AI、无简历内容上传至其他服务。20页/文本长度和图像资源设上限；加密、扫描件、特殊字体、坏文件均可提示手动填写。只建议明确识别出的邮箱/手机号，用户选择导入空白字段后核对并保存，不覆盖非空资料、不自动猜姓名/经历。

上传中断可使用同一UUID重试。R2与D1不是分布式事务：状态不是ready时不允许用于投递；失败时保留可解释状态，不删除可能被并发请求引用的原件。

## 前端

1. 新增“简历中心”：命名上传、进度/错误、文件列表、默认版本、预览/下载、文本提取、归档与恢复。
2. “个人资料”新增版本说明、来源原件、历史列表、只读查看、恢复为新版本。未保存更改离开或恢复前明确提示。
3. 文本提取只作为待确认草稿，保存资料后才进入历史；文件上传本身不覆盖资料。
4. 手机可查看/下载、管理版本；后续官网自动投递仍由桌面连接器处理。

## 验收

- A01：上传真实有效PDF，刷新后仍存在；下载字节SHA256与上传一致，预览/单Range正确。
- A02：空文件、超限、伪PDF、非法元信息正确拒绝；不创建ready记录。
- A03：同UUID重试不生成重复版本，不同内容不能覆盖旧原件。
- A04：默认选择CAS冲突返回409；归档默认文件清空默认，归档可恢复，原件不丢失。
- A05：文字型PDF真实提取文本；解析失败不丢原件，不把空文本称为解析成功。
- A06：资料连续保存产生独立快照；修改当前资料后旧内容不变。
- A07：恢复旧资料产生新revision；并发或过期version不能覆盖现有内容。
- A08：所有文件、快照、来源引用和默认设置都按用户授权；匿名401、跨用户404。
- A09：云端真实D1/R2完成上传→下载→资料保存→历史恢复；测试文件明确标记并归档，不向企业投递。

## 实施顺序

迁移与领域校验 → 原件API → 资料快照API → 界面 → 必要单元/数据库事务测试 → 构建部署 → 真实站点验收。当前文件是设计基线，最终验收结果另记。

## 补充验收：PDF 预览与账号隔离（2026-11-18）

- PDF预览改为本站托管的PDF.js Canvas渲染；懒加载库/Worker/CMap/字体/WASM，不依赖原生PDF插件、不发往第三方。具备页码、翻页、宽度适配、缩放、加载/失败提示、重试、取消/卸载资源清理，单页画布限800万像素。
- `npm test`：12项通过；`npm run test:m1:integration`：79项HTTP检查通过。
- 集成脚本使用实际生产构建，在workerd中运行，D1实际SQLite和R2本地仿真持久化；两套身份在受信Worker入口注入，仅存在于测试进程。匿名401，跨账号文件/提取/归档/恢复/快照/来源引用/默认选择404；上传ID冲突409且不泄露原件元数据。
- 同时验证真实PDF上传下载哈希、Range206/416、无效上传、幂等重试、真实提取/坏文件降级、快照不变、并发保存一个200一个409、恢复新版本、默认清空和归档恢复。
- 用户确认没有第二个登录账号，先采用自动化隔离验收；以上不冒充生产环境第二账号OAuth登录测试。站点仍保持owner-only。
- PDF线上绘制验收结果在根目录`docs/08-m1-delivery.md`记录；完成前不进入M2实现。

线上已验证：此前空白的归档原件现在显示实际文字；两页PDF前后翻页和150%缩放显示正确页面；损坏PDF显示错误提示和重试。归档确认使用页面内确认区，避免内置浏览器原生confirm阻塞。M1按用户确认的自动化身份隔离范围验收通过。
