import {mokaSources, readZhihuJobs} from './moka';
import {nvidiaSource, readNvidiaJobs} from './workday';

export const catalogSources = [
  ...mokaSources.map(source=>({
    ...source, adapterKey:'moka-public-v1', label:'Moka 校园招聘',
    read:()=>readZhihuJobs(fetch,source),
  })),
  {...nvidiaSource, adapterKey:'workday-public-v1', label:'Workday 中国实习', read:()=>readNvidiaJobs()},
];
