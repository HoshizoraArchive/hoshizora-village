import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { parse } from '@babel/parser';

const navSource = readFileSync(new URL('./components/BottomNav.jsx', import.meta.url), 'utf8');
const transformed = transformSync(navSource,{loader:'jsx',format:'cjs',jsx:'transform',jsxFactory:'React.createElement'});
const navModule = { exports: {} };
new Function('module','exports','React',transformed.code)(navModule,navModule.exports,React);
const { BottomNav } = navModule.exports;
assert.equal(typeof BottomNav,'function');

function render(count) {
  return renderToStaticMarkup(React.createElement(BottomNav,{
    activeTab:'observe',onTabChange(){},unreadCount:count,
  }));
}

test('R:Connect unread=0 has no visual badge', () => {
  assert.equal(render(0).includes('data-testid="rconnect-unread-badge"'),false);
});
test('R:Connect unread=1 displays 1 without changing navigation accessible name', () => {
  const html=render(1);
  assert.match(html,/data-testid="rconnect-unread-badge"/);
  assert.match(html,/>1<\/span>/);
  assert.match(html,/aria-label="Re:Connect"/);
});
test('R:Connect unread=100 caps at 99+', () => {
  assert.match(render(100),/>99\+<\/span>/);
});
test('R:Connect unrelated tab never receives a badge', () => {
  assert.equal((render(3).match(/data-testid="rconnect-unread-badge"/g)||[]).length,1);
});

const appSource=readFileSync(new URL('./App.jsx',import.meta.url),'utf8');
const ast=parse(appSource,{sourceType:'module',plugins:['jsx']});
const app=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='App');
assert.ok(app);
const effectNode=app.body.body.find(n=>n.type==='ExpressionStatement'&&n.expression.callee?.name==='useEffect'&&appSource.slice(n.start,n.end).includes('async function readNotifications()'));
assert.ok(effectNode,'test the actual notification reader effect');
const callbackSource=appSource.slice(effectNode.expression.arguments[0].start,effectNode.expression.arguments[0].end);
function deferred(){let resolve,reject;const promise=new Promise((rs,rj)=>{resolve=rs;reject=rj});return{promise,resolve,reject}}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve()}
function harness({withActor=false}={}){
  const live={id:'A',key:'A:1'};
  const state={notifications:[],notificationsLoading:false,notificationsError:'',notificationsMessage:'',notificationUpdatingId:null};
  const post=deferred(), actor=deferred();
  const calls={reads:0,actorReads:0,errors:[]};
  let holdNotifications=false,queuedNotificationUpdate=null;
  const set=(field)=>(v)=>{
    if(field==='notifications' && holdNotifications && typeof v==='function'){
      queuedNotificationUpdate=v;
      return;
    }
    state[field]=typeof v==='function'?v(state[field]):v;
  };
  const query={select:()=>query,eq:()=>query,order:()=>{calls.reads++;return post.promise}};
  const ctx={
    session:{user:{id:'A'}},profileFrames:{},authIdentityEpoch:1,
    captureDataMutationSession:()=>({userId:live.id,sessionKey:live.key}),
    isCurrentDataMutationSession:(ticket)=>ticket?.userId===live.id&&ticket?.sessionKey===live.key,
    setNotifications:set('notifications'),setNotificationsLoading:set('notificationsLoading'),
    setNotificationsError:set('notificationsError'),setNotificationsMessage:set('notificationsMessage'),
    setNotificationUpdatingId:set('notificationUpdatingId'),
    supabase:{from:(table)=>{assert.equal(table,'notifications');return query}},
    runProfileQuery:()=>{calls.actorReads++;return actor.promise},
    getProfileFrameById:()=>null,
    PROFILE_BASIC_SELECT_COLUMNS_WITH_FRAME:'id,display_name,active_frame_id',
    PROFILE_BASIC_SELECT_COLUMNS:'id,display_name',
    getUserFacingError:()=> '安全な読み込みエラー',
    ERROR_OPERATION:{NOTIFICATION_LOAD:'notification_load'},
    logSafeError:(...args)=>calls.errors.push(args),
  };
  const effect=new Function(...Object.keys(ctx),'return ('+callbackSource+')')(...Object.values(ctx));
  return {live,state,post,actor,calls,effect,withActor,
    holdNotifications:()=>{holdNotifications=true},
    flushNotifications:()=>{
      assert.ok(queuedNotificationUpdate,'notification updater should be queued');
      state.notifications=queuedNotificationUpdate(state.notifications);
    },
  };
}
test('old A success after switching to B cannot populate B notifications', async()=>{
  const h=harness();
  h.effect();
  h.live.id='B';h.live.key='B:2';
  h.state.notifications=[{id:'B-own',recipient_id:'B',is_read:false}];
  h.state.notificationsLoading=true;
  h.post.resolve({data:[{id:'A-private',recipient_id:'A',actor_id:null,is_read:false}],error:null});
  await flush();
  assert.deepEqual(h.state.notifications.map(n=>n.id),['B-own']);
  assert.equal(h.state.notificationsLoading,true);
});
test('A→B→A without intermediate render cannot accept old A notification result',async()=>{
  const h=harness();h.effect();
  h.live.id='B';h.live.key='B:2';h.live.id='A';h.live.key='A:3';
  h.state.notifications=[{id:'A-new',recipient_id:'A',is_read:false}];
  h.post.resolve({data:[{id:'A-old',recipient_id:'A',is_read:false}],error:null});
  await flush();
  assert.deepEqual(h.state.notifications.map(n=>n.id),['A-new']);
});
test('old A notification failure must not contaminate B error/status',async()=>{
  const h=harness();h.effect();
  h.live.id='B';h.live.key='B:2';h.state.notificationsError='B current status';
  h.post.resolve({data:null,error:{code:'network'}});
  await flush();
  assert.equal(h.state.notificationsError,'B current status');
});
test('switch while actor-profile query is pending suppresses A data',async()=>{
  const h=harness();h.effect();
  h.post.resolve({data:[{id:'nA',recipient_id:'A',actor_id:'author-a',is_read:false}],error:null});
  await flush();assert.equal(h.calls.actorReads,1);
  h.live.id='B';h.live.key='B:2';h.state.notifications=[{id:'nB',recipient_id:'B'}];
  h.actor.resolve({data:[{id:'author-a',display_name:'private'}]});
  await flush();
  assert.deepEqual(h.state.notifications.map(n=>n.id),['nB']);
});
test('current-session success hydrates notification actor and completes loading',async()=>{
  const h=harness();h.effect();
  h.post.resolve({data:[{id:'nA',recipient_id:'A',actor_id:'author-a',is_read:false}],error:null});
  await flush();
  h.actor.resolve({data:[{id:'author-a',display_name:'A author'}]});
  await flush();
  assert.equal(h.state.notifications[0].actorProfile.display_name,'A author');
  assert.equal(h.state.notificationsLoading,false);
});
test('current Promise rejection is handled safely instead of unhandled',async()=>{
  const h=harness();h.effect();
  h.post.reject(new Error('sensitive transport detail'));
  await flush();
  assert.equal(h.state.notificationsError,'安全な読み込みエラー');
  assert.equal(h.state.notificationsLoading,false);
  assert.equal(h.calls.errors.length,1);
});
test('old Promise rejection after A→B→A cannot report error',async()=>{
  const h=harness();h.effect();
  h.live.id='B';h.live.key='B:2';h.live.id='A';h.live.key='A:3';
  h.state.notificationsError='current';
  h.post.reject(new Error('old private error'));
  await flush();
  assert.equal(h.state.notificationsError,'current');
  assert.equal(h.calls.errors.length,0);
});
test('notification loader subscribes to Auth epoch',()=>{
  const deps=effectNode.expression.arguments[1].elements.map(n=>appSource.slice(n.start,n.end));
  assert.ok(deps.includes('authIdentityEpoch'));
});

test('queued React notification updater checks Auth epoch at application time',async()=>{
  const h=harness();h.holdNotifications();h.effect();
  h.post.resolve({data:[{id:'nA',recipient_id:'A',actor_id:null,is_read:false}],error:null});
  await flush();
  h.live.id='B';h.live.key='B:2';
  h.state.notifications=[{id:'nB',recipient_id:'B',is_read:false}];
  h.flushNotifications();
  assert.deepEqual(h.state.notifications.map(n=>n.id),['nB']);
});

test('malformed notification response with another recipient is not surfaced',async()=>{
  const h=harness();h.effect();
  h.post.resolve({data:[{id:'unexpected',recipient_id:'B',actor_id:null,is_read:false},
                        {id:'own',recipient_id:'A',actor_id:null,is_read:false}],error:null});
  await flush();
  assert.deepEqual(h.state.notifications.map(n=>n.id),['own']);
});

test('unread count counts unread only from the current-account visible list',()=>{
  const node=app.body.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(x=>x.id?.name==='unreadNotificationCount'));
  assert.ok(node,'App computes unread count');
  const declaration=node.declarations.find(x=>x.id.name==='unreadNotificationCount');
  const expression=appSource.slice(declaration.init.start,declaration.init.end);
  const calc=new Function('visibleNotifications','return ('+expression+')');
  assert.equal(calc([{recipient_id:'A',is_read:false},{recipient_id:'A',is_read:true},{recipient_id:'A',is_read:false}]),2);
  assert.equal(calc([{recipient_id:'B',is_read:false}]),1);
  assert.equal(calc([]),0);
});

test('notification reader refreshes when user opens Re:Connect tab again',()=>{
  const deps=effectNode.expression.arguments[1].elements.map(n=>appSource.slice(n.start,n.end));
  assert.ok(deps.includes('activeTab'));
});
test('Re:Connect list immediately scopes previously loaded notifications to current account',()=>{
  const declaration=app.body.body.find(n=>n.type==='VariableDeclaration' && n.declarations.some(x=>x.id?.name==='visibleNotifications'));
  assert.ok(declaration, 'App must derive current-session-only notifications before render');
  const expression=declaration.declarations.find(x=>x.id.name==='visibleNotifications').init;
  const select=new Function('session','notifications','return ('+appSource.slice(expression.start,expression.end)+')');
  const stale=[{id:'A-1',recipient_id:'A',is_read:false},{id:'B-1',recipient_id:'B',is_read:false}];
  assert.deepEqual(select({user:{id:'B'}},stale).map(x=>x.id),['B-1']);
  assert.deepEqual(select(null,stale),[]);
  const notificationState=app.body.body.find(n=>n.type==='VariableDeclaration' && n.declarations.some(x=>x.id?.name==='notificationState'));
  assert.ok(notificationState,'notificationState should be built from visibleNotifications');
  const initializer=notificationState.declarations.find(x=>x.id.name==='notificationState').init;
  const items=initializer.properties.find(x=>x.key?.name==='items');
  assert.equal(items?.value?.name,'visibleNotifications');
});
