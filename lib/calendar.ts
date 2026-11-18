import type { Interview } from './interviews';
export function escapeIcs(value:string){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
export function foldIcs(line:string){const encoder=new TextEncoder();let current='',size=0;const lines:string[]=[];for(const ch of line){const n=encoder.encode(ch).length;if(size+n>75){lines.push(current);current=' ';size=1;}current+=ch;size+=n;}lines.push(current);return lines.join('\r\n');}
function stamp(value:string){return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
export function calendar(events:Interview[]){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Job Tracker//Interview Calendar//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const event of events){lines.push('BEGIN:VEVENT',`UID:${event.id}@jobtracker`,`SEQUENCE:${event.version}`,`DTSTAMP:${stamp(event.updatedAt)}`,`DTSTART:${stamp(event.startsAt)}`,`DTEND:${stamp(event.endsAt)}`,`SUMMARY:${escapeIcs(`${event.company} · ${event.round}`)}`,`DESCRIPTION:${escapeIcs([event.title,event.preparation,event.meetingUrl].filter(Boolean).join('\n'))}`,`LOCATION:${escapeIcs(event.location||event.meetingUrl)}`,`STATUS:${event.state==='cancelled'?'CANCELLED':'CONFIRMED'}`);
 if(event.state==='scheduled')lines.push('BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:面试即将开始','END:VALARM');lines.push('END:VEVENT');}
 lines.push('END:VCALENDAR');return lines.map(foldIcs).join('\r\n')+'\r\n';}
