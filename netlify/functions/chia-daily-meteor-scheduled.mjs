import dispatchChiaDailyMeteor from "./chia-daily-meteor-dispatch.mjs";

export default dispatchChiaDailyMeteor;

export const config = {
  schedule: "0,10,20,30,40,50 3,10,23 * * *",
};
