export const companies = [
 {id:'zhihu',name:'知乎',url:'https://app.mokahr.com/campus_apply/zhihu/3818#/',hosts:['app.mokahr.com/campus_apply/zhihu'],note:'已免登录核对一个真实岗位申请表的字段；未填写或提交。'},
 {id:'bytedance',name:'字节跳动',url:'https://jobs.bytedance.com/',hosts:['jobs.bytedance.com','jobs.toutiao.com','careers.larksuite.com'],note:'飞书系招聘站；需登录后检查个人简历页面。'},
 {id:'tencent',name:'腾讯',url:'https://join.qq.com/',hosts:['join.qq.com','careers.tencent.com'],note:'校招与社招入口不同；分别保存字段映射。'},
 {id:'alibaba',name:'阿里巴巴',url:'https://talent.alibaba.com/',hosts:['talent.alibaba.com'],note:'不同业务招聘站可能不同，按实际页面保存映射。'},
 {id:'meituan',name:'美团',url:'https://zhaopin.meituan.com/web/campus',hosts:['zhaopin.meituan.com','hr.meituan.com'],note:'原生字段可识别；学校、城市等自定义选择器需手动确认。'},
 {id:'jd',name:'京东',url:'https://campus.jd.com/',hosts:['campus.jd.com','zhaopin.jd.com'],note:'多段经历先在官网添加对应行，再扫描字段。'},
 {id:'baidu',name:'百度',url:'https://talent.baidu.com/jobs/',hosts:['talent.baidu.com'],note:'逐页填写后重新扫描，不自动点击下一步。'},
 {id:'netease',name:'网易',url:'https://hr.163.com/',hosts:['hr.163.com','campus.163.com'],note:'不同事业部站点分别验证，官网入口仍需复核。'},
 {id:'kuaishou',name:'快手',url:'https://zhaopin.kuaishou.cn/',hosts:['zhaopin.kuaishou.cn'],note:'需登录验证候选人表单，自定义控件暂不自动选择。'},
 {id:'xiaomi',name:'小米',url:'https://hr.xiaomi.com/website/campus.html',hosts:['hr.xiaomi.com'],note:'页面更新后旧映射失配将停止，不盲填。'},
 {id:'pdd',name:'拼多多',url:'https://careers.pinduoduo.com/',hosts:['careers.pinduoduo.com'],note:'官网入口仍需复核；优先通过手动字段映射适配。'},
] as const;
export const adapterRulesVersion='2026.11.18.1';
