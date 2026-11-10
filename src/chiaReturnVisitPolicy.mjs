/** Detect a grounded return gap from server-recorded app opens, with no action. */
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DAY=86400000;
const time=value=>typeof value==='string'?Date.parse(value):NaN;
export function assessChiaReturnVisit({personProfileId,openEvents,now=Date.now(),absenceDays=14,recognitionWindowDays=7}={}) {
  if (!UUID.test(personProfileId??'')||!Array.isArray(openEvents)||!Number.isFinite(now)||
      !Number.isInteger(absenceDays)||absenceDays<1||!Number.isInteger(recognitionWindowDays)||recognitionWindowDays<1) return null;
  const times=openEvents.filter(event=>event?.user_id===personProfileId)
    .map(event=>time(event.opened_at)).filter(stamp=>Number.isFinite(stamp)&&stamp<=now)
    .sort((a,b)=>b-a);
  if(times.length<2||now-times[0]>recognitionWindowDays*DAY) return null;
  for(let i=0;i<times.length-1;i++){
    if(times[i]-times[i+1]>=absenceDays*DAY){
      if(now-times[i]>recognitionWindowDays*DAY) return null;
      return Object.freeze({isReturning:true,lastReturnAt:new Date(times[i]).toISOString(),priorVisitAt:new Date(times[i+1]).toISOString(),absenceDays:Math.floor((times[i]-times[i+1])/DAY)});
    }
  }
  return null;
}
