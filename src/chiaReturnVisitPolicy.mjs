/**
 * Pure read-only interpretation of a COMPLETE server-side app-open history
 * window. It must never infer absence from a page of incomplete client events.
 * The caller is required to obtain an exhaustive, owner-scoped range ordered
 * from public.app_open_events.opened_at on the trusted server.
 * No actions (messages, notifications, tracking writes) occur here.
 */
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DAY=86400000;
const time=value=>typeof value==='string'?Date.parse(value):NaN;
export function assessChiaReturnVisit({personProfileId,openEvents,verifiedWindow,
  now=Date.now(),absenceDays=14,recognitionWindowDays=7}={}) {
  if (!UUID.test(personProfileId??'')||!Array.isArray(openEvents)||!Number.isFinite(now)||
      !Number.isInteger(absenceDays)||absenceDays<1||!Number.isInteger(recognitionWindowDays)||recognitionWindowDays<1||
      verifiedWindow?.complete!==true||verifiedWindow?.source!=='app_open_events.opened_at' ||
      verifiedWindow?.personProfileId!==personProfileId) return null;
  const from=time(verifiedWindow.from);
  const through=time(verifiedWindow.through);
  // Require the range to cover a recent server snapshot, not future or stale
  // client times. Earlier visits may be included but never extrapolated.
  if(!Number.isFinite(from)||!Number.isFinite(through)||from>through||
    from>now||through>now+60000||through<now-300000) return null;
  const times=openEvents.filter(event=>event?.user_id===personProfileId)
    .map(event=>time(event.opened_at)).filter(stamp=>Number.isFinite(stamp)&&stamp<=through&&stamp>=from)
    .sort((a,b)=>b-a);
  if(times.length<2||now-times[0]>recognitionWindowDays*DAY) return null;
  for(let i=0;i<times.length-1;i++){
    if(times[i]-times[i+1]>=absenceDays*DAY){
      if(now-times[i]>recognitionWindowDays*DAY) return null;
      return Object.freeze({isReturning:true,lastReturnAt:new Date(times[i]).toISOString(),
        priorVisitAt:new Date(times[i+1]).toISOString(),absenceDays:Math.floor((times[i]-times[i+1])/DAY)});
    }
  }
  return null;
}
