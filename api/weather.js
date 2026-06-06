import { handleWeatherRequest } from "../server/weatherProxy.js";

export default async function handler(req, res) {
  await handleWeatherRequest(req, res);
}
