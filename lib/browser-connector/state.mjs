export const SCOPES=['领取本人一个已确认任务','读取该租约的冻结资料与原件','回传提交前状态；不允许宣布投递成功'];
export const ACTIVE_STATES=['leased','needs_login','needs_verification','needs_consent','ready_for_adapter','adapter_running','needs_manual_fields','awaiting_final_confirmation'];
export const CANCELLABLE_STATES=['needs_connector',...ACTIVE_STATES,'needs_review'];
/** @type {Record<string,string>} */
export const stateLabels={needs_connector:'等待连接器',leased:'已领取，正在核对页面',needs_login:'等待本人登录',needs_verification:'等待本人验证',needs_consent:'等待本人处理官网协议',ready_for_adapter:'目标页已核对，可准备填表',adapter_running:'官网操作已授权，等待核对结果',needs_manual_fields:'请核对官网字段与附件',awaiting_final_confirmation:'等待本人最终确认，尚未提交',needs_review:'租约失效或页面异常，待本人核对',cancelled:'已取消'};
