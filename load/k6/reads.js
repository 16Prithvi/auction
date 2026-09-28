import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    cachedReads: {
      executor: "constant-vus",
      vus: 20,
      duration: "20s",
    },
  },
};

export default function () {
  const response = http.get(
    `${__ENV.BASE_URL}/auctions/${__ENV.AUCTION_ID}`,
  );
  check(response, {
    "200": (result) => result.status === 200,
    "HIT": (result) =>
      result.headers["X-Cache"] === "HIT" || result.headers["x-cache"] === "HIT",
  });
}
