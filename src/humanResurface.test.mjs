import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mixHumanResurfacePosts as mix} from './humanResurface.mjs';
const now=Date.parse('2026-10-12T00:00:00Z');
const ai=n=>({id:'ai'+n,author_id:'bot',visibility:'public',created_at:new Date(now-n*1000).toISOString()});
const human=(id,author='h',time=now-86400000)=>({id,author_id:author,visibility:'public',created_at:new Date(time).toISOString()});
const context=(humans=['h'],ais=['bot'])=>({humanAuthorIds:new Set(humans),aiAuthorIds:new Set(ais),now});
test('all 20 originals preserved even with five insertions',()=>{
 const base=Array.from({length:20},(_,i)=>ai(i));const picked=Array.from({length:7},(_,i)=>human('h'+i,'h'+i,now-(i+1)*86400000));
 const out=mix(base,picked,context(picked.map(x=>x.author_id)));
 assert.equal(out.length,25);
 assert.deepEqual(out.filter(x=>x.id.startsWith('ai')).map(x=>x.id),base.map(x=>x.id));
 assert.equal(out.filter(x=>x.id.startsWith('h')).length,5);
 assert.deepEqual(out.slice(0,4).map(x=>x.id),['ai0','ai1','ai2','h0']);
});
test('does not hide a human in the original 20 even if at the end',()=>{
 const base=[...Array.from({length:19},(_,i)=>ai(i)),human('last','h0')];const out=mix(base,[human('more','h0'),human('h1','h1')],context(['h0','h1']));
 assert.equal(out.filter(x=>x.id==='last').length,1);
 assert.equal(out.filter(x=>x.id==='more').length,0);
});
test('an unknown-classification post interrupts the AI run',()=>{
 const base=[ai(0),{...ai(1),author_id:'unknown'},ai(2),ai(3),ai(4)];
 const out=mix(base,[human('new')],context());
 assert.deepEqual(out.map(x=>x.id),['ai0','ai1','ai2','ai3','ai4','new']);
});
test('no AI confirmation means unchanged base',()=>{
 const base=[ai(0),ai(1),ai(2)];assert.deepEqual(mix(base,[human('new')],context(['h'],[])),base);
});
test('rejects deleted_at, tombstoned, private, unavailable, excluded snapshot and blocked author',()=>{
 const candidate=[human('deleted','h1'),human('tomb','h2'),human('private','h3'),human('unavail','h4'),human('excluded','h5'),human('blocked','h6'),human('valid','h7')];
 candidate[0].deleted_at='2026-10-11T00:00:00Z';candidate[1].tombstoned=true;candidate[2].visibility='private';candidate[3].available=false;
 const out=mix([ai(0),ai(1),ai(2)],candidate,{...context(candidate.map(x=>x.author_id)),excludedPostIds:new Set(['excluded']),blockedAuthorIds:new Set(['h6'])});
 assert.deepEqual(out.filter(x=>x.id.startsWith('valid')||candidate.some(y=>y.id===x.id)).map(x=>x.id),['valid']);
});
test('blocked base posts are excluded before selecting visible 20',()=>{
 const base=[{...ai(0),author_id:'blocked'},ai(1),ai(2),ai(3)];
 const out=mix(base,[human('h1')],{...context(),blockedAuthorIds:new Set(['blocked'])});
 assert.deepEqual(out.map(x=>x.id),['ai1','ai2','ai3','h1']);
});
test('future, invalid and outside 60d rejected, inclusive lower boundary accepted',()=>{
 const c=[human('invalid'),human('future','future',now+1),human('old','old',now-60*86400000-1),human('edge','edge',now-60*86400000)];
 c[0].created_at='bogus';
 const out=mix([ai(0),ai(1),ai(2)],c,context(c.map(x=>x.author_id)));
 assert.equal(out.at(-1).id,'edge');
});
test('deduplicates by author, post id and preserves order in base',()=>{
 const base=[ai(0),ai(1),ai(2),human('existing','a'),ai(3),ai(4),ai(5)];
 const out=mix(base,[human('existing','a'),human('dup','a'),human('bob1','b',now-2*86400000),human('bob2','b',now-3*86400000)],context(['a','b']));
 assert.equal(out.filter(x=>x.author_id==='b').length,1);
 assert.equal(out.filter(x=>x.author_id==='a').length,1);
 assert.deepEqual(out.filter(x=>x.id.startsWith('ai')).map(x=>x.id),['ai0','ai1','ai2','ai3','ai4','ai5']);
});
test('API failure equivalent leaves base unchanged',()=>{
 const base=[ai(0),ai(1),ai(2)];
 assert.deepEqual(mix(base,[],context()),base);assert.deepEqual(mix(base,undefined,context()),base);
});

test('a newer or equal-time higher-id candidate cannot appear below an older headline',()=>{
 const base=[ai(0),ai(1),ai(2)];
 const ahead=human('hAhead','hAhead',now+1000);
 const tied=human('zTied','hTied',now);
 const older=human('older','hOlder',now-1000);
 const output=mix(base,[ahead,tied,older],{...context(['hAhead','hTied','hOlder']),now:now+10_000});
 assert.deepEqual(output.map(x=>x.id),['ai0','ai1','ai2','older']);
});
