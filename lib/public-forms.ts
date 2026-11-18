// Observed from a public application form; no candidate data or submissions captured.
export const publicForms=[{
 id:'zhihu-276cde6c',company:'知乎',jobTitle:'推荐算法实习生（27届）',checkedAt:'2026-11-18',
 url:'https://app.mokahr.com/campus_apply/zhihu/3818#/job/276cde6c-124e-4059-b656-3d2636317338/apply?pure=1',
 documentation:'https://mokahr.moyincloud.com/d/1687298462988660738.html',
 fields:[
 {label:'毕业时间',required:true,keys:['graduationMonth']},
 {label:'是否可以实习',required:true,keys:['internshipAvailability']},
 {label:'招聘信息来源',required:true,keys:['jobSource']},
 {label:'期望城市',required:true,keys:['expectedCities']},
 {label:'就读时间',required:true,keys:['education.start','education.end']},
 {label:'学校名称',required:true,keys:['education.school']},
 {label:'专业名称',required:true,keys:['education.major']},
 {label:'学历',required:true,keys:['education.degree']},
 ],
 note:'同一岗位的字段也可能变化。上传简历、附件、照片等已在公开表单中看到，但未确认是否必填；学校/专业/学历和年月使用自定义控件，仍需选择确认。没有以该页面推断其他公司必填项。',
}] as const;
