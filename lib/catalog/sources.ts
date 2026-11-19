import {mokaSources, readZhihuJobs} from './moka';
import {bytedanceSource, readByteDanceJobs} from './bytedance';
import {tencentSource, readTencentJobs} from './tencent';
import {nvidiaSource, readNvidiaJobs} from './workday';

export const catalogSources = [
  {...tencentSource, adapterKey:'tencent-campus-public-v1', label:'校招与实习 · AI 全栈 / 后端开发', read:()=>readTencentJobs()},
  {...bytedanceSource, adapterKey:'bytedance-international-public-v1', label:'国际站 · 西雅图机器学习实习', read:()=>readByteDanceJobs()},
  ...mokaSources.map(source=>({
    ...source, adapterKey:'moka-public-v1', label:'Moka 校园招聘',
    read:()=>readZhihuJobs(fetch,source),
  })),
  {...nvidiaSource, adapterKey:'workday-public-v1', label:'Workday 中国实习', read:()=>readNvidiaJobs()},
];
