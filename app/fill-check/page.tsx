import {requireChatGPTUser} from '../chatgpt-auth';
import FillCheck from './test-form';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/fill-check');return <FillCheck/>;}
