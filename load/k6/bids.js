import http from "k6/http";
import { check } from "k6";

http.setResponseCallback(http.expectedStatuses(201, 409));

export const options = {
  scenarios: {
    sameAuction: {
      executor: "per-vu-iterations",
      vus: 40,
      iterations: 1,
      maxDuration: "30s",
    },
  },
};

export default function () {
  const amount = (100 + __VU * 10).toFixed(2);
  const response = http.post(
    `${__ENV.BASE_URL}/auctions/${__ENV.AUCTION_ID}/bids`,
    JSON.stringify({ amount }),
    {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${__ENV.TOKEN}`,
      },
    },
  );
  check(response, {
    "accepted or too low": (result) => result.status === 201 || result.status === 409,
    "no server error": (result) => result.status < 500,
  });
}
