# M4 浏览器连接器

## 范围

Chrome/Edge Manifest V3 扩展与真实工作台 API、D1、R2 连接。此版本只做任务领取、材料校验和提交前状态回传；不填表、不上传到雇主、不点击提交，也不生成投递成功回执。登录、验证码和官网协议由用户处理。

私有 Sites 必须有有效登录身份。扩展通过同一浏览器已登录且保持打开的工作台根页面中继同源请求，并额外携带设备证明。不会向扩展分发管理凭据或绕过登录的密钥。

## 数据与权限

- browser_pairings：五分钟单次配对码，仅存摘要；扩展请求后需要工作台明确批准。
- browser_devices：设备证明仅存摘要，授权三十天，可随时撤销；在线状态取实际心跳。
- browser_leases：每设备、每任务仅一个有效租约；120 秒有效，心跳可续期，单次最长三十分钟。
- browser_events：不可修改的状态回传日志，事件 ID 幂等，内容摘要防止重放时更改请求。
- submission_tasks.active_lease_id：原子领取与版本条件更新；不存在自动重新投递。

设备只能读取当前有效租约对应的冻结资料和原始简历。读取原件前校验 R2 文件长度与 SHA-256，响应禁止缓存。取消、材料变更、撤销、过期和跨账号访问都会拒绝旧证明。过期进入人工复核，必须明确确认未提交后才能重新排队。

## API

前缀 `/api/browser-connector`；所有接口要求当前 Sites 身份，设备接口还要求标准 Authorization Bearer 设备证明。POST 最大 16KiB，严格字段校验，租约证明只在请求体内传递。

| 方法与路径 | 用途 |
| --- | --- |
| GET /manage | 本人设备、配对与授权范围 |
| POST /pairings/start | 生成配对码 |
| POST /pairings/request、/pairings/status | 扩展申请和轮询 |
| POST /pairings/:id/approve、cancel | 本人明确批准或取消，带版本 |
| POST /devices/:id/revoke | 撤销设备，带版本 |
| POST /tasks/:id/resume | 人工复核后重新排队 |
| GET /device/tasks | 只列本人待连接任务的最少元数据 |
| POST /device/claim | 请求 ID、任务 ID、租约秘密；竞争领取 |
| POST /device/heartbeat | 实际心跳和持证明续租 |
| POST /device/materials、/device/file | 当前租约的冻结材料与原件 |
| POST /device/events | 版本、事件 ID、受限枚举和可选规范目标 URL |
| POST /device/release、/device/revoke | 主动释放或撤销当前设备 |

可回传 needs_login、needs_verification、needs_consent、page_verified、page_mismatch；不接受 submitted、自由文本、Cookie、验证码或任意地址。只允许知乎/Moka 已冻结岗位的精确申请页面。

## 安装与验证

工作台“浏览器连接”下载 ZIP，解压后在 Chrome/Edge 扩展管理页加载已解压扩展。保持工作台根页面打开并登录，在工作台生成配对码，扩展输入后，再回工作台核对设备名与范围并批准。安装扩展前已打开的工作台页面需要刷新。

`npm test` 覆盖协议、URL、桥接白名单与扩展权限。`npm run test:m4:live` 使用实际 Worker 构建、隔离 D1 SQLite/R2 和两个测试身份，同时核验真实知乎公开岗位源；测试候选人材料仅存临时环境，不写生产、不向雇主投递。验收通过 251 次 HTTP 检查。真实 Chrome 扩展安装、用户授权与官网页面识别仍需用户现场联调，不能用自动化后端测试替代。


## v0.2.1 连接恢复优化

明确的领取拒绝会清理本机待处理请求，允许重新选择任务；网络超时或服务器结果未知时保留原请求 ID 和证明，重试不会额外领取。状态版本冲突时清理被拒绝的事件，并通过有效租约重新读取任务版本；不自动重放用户操作。配对记录无效时清除本机失效请求。空任务列表禁止领取。跨账号取消配对统一返回不存在。

新增四项扩展后台执行测试，覆盖上述领取和状态回传的断网/冲突恢复，测试使用实际后台源码和隔离 Chrome API 桩；它们不替代真实 Chrome 安装联调。单元测试共 30 项。
