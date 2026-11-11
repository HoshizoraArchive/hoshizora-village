import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessChiaReturnVisit as assess} from './chiaReturnVisitPolicy.mjs';
const person='41000000-0000-4000-8000-000000000002',other='41000000-0000-4000-8000-000000000003';
const now=Date.parse('2026-11-11T00:00:00Z');
const open=(daysAgo,user_id=person)=>({user_id,opened_at:new Date(now-daysAgo*86400000).toISOString()});
const input=openEvents=>({personProfileId:person,openEvents,now,
  verifiedWindow:{source:'app_open_events.opened_at',complete:true,personProfileId:person,
    from:new Date(now-120*86400000).toISOString(),through:new Date(now).toISOString()}});
test('real return needs two trusted same-person server open times with 14-day gap',()=>{
  const result=assess(input([open(0),open(40)]));
  assert.equal(result.isReturning,true);
  assert.equal(result.absenceDays,40);
  assert.equal(result.priorVisitAt,'2026-10-02T00:00:00.000Z');
});
test('no fresh open, no earlier open, another person, or short gap => no return event',()=>{
  assert.equal(assess(input([open(10),open(90)])),null);
  assert.equal(assess(input([open(0)])),null);
  assert.equal(assess(input([open(0),open(20,other)])),null);
  assert.equal(assess(input([open(0),open(2)])),null);
});
test('many opens since return still classify recent verified gap; not stale historical gap',()=>{
  assert.equal(assess(input([open(0),open(1),open(2),open(80)])).absenceDays,78);
  assert.equal(assess(input([open(0),open(1),open(10),open(100)])),null);
});
test('future client signal cannot become a return; do not send notifications',()=>{
  assert.equal(assess(input([open(-1),open(50)])),null);
  const result=assess(input([open(0),open(30)]));
  assert.equal('sendNotification' in result,false);
  assert.equal('postToFeed' in result,false);
});

test('browser-client time is not accepted as proof of a visit',()=>{
  const events=[{user_id:person,client_opened_at:new Date(now).toISOString()},{user_id:person,client_opened_at:new Date(now-40*86400000).toISOString()}];
  assert.equal(assess(input(events)),null);
});

test('incomplete or unverified event history cannot manufacture a return',()=>{
  const history=[open(0),open(40)];
  assert.equal(assess({...input(history),verifiedWindow:undefined}),null);
  assert.equal(assess({...input(history),verifiedWindow:{...input(history).verifiedWindow,complete:false}}),null);
  assert.equal(assess({...input(history),verifiedWindow:{...input(history).verifiedWindow,from:new Date(now-3*86400000).toISOString()}}),null);
  assert.equal(assess({...input(history),verifiedWindow:{...input(history).verifiedWindow,personProfileId:other}}),null);
  assert.equal(assess({...input(history),verifiedWindow:{...input(history).verifiedWindow,through:new Date(now-86400000).toISOString()}}),null);
});
