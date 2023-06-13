import mbxClient from "@mapbox/mapbox-sdk/lib/classes/mapi-client";
import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding";
import { type Address } from "@prisma/client";
import { env } from "../../../env.mjs";

const mapboxClient = new mbxClient({
  accessToken: env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
});

export const geocodePlugin = async (address: Address) => {
  const query = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.country,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const geocodingService = mbxGeocoding(mapboxClient);

  const response = await geocodingService
    .forwardGeocode({
      query,
      limit: 1,
      types: ["address"],
    })
    .send();

  if (!response.body.features[0]) {
    throw new Error("No features found");
  }

  const countryFeature = response.body.features[0].context.find((context) =>
    context.id.startsWith("country")
  ) as Record<string, any> | undefined;

  const countryCode =
    (countryFeature?.short_code as string | undefined) ?? null;

  if (!countryCode) {
    throw new Error("No country code found");
  }

  const center = response.body.features[0].center;
  if (!center[1] || !center[0]) {
    throw new Error("Center missing latitude or longitude");
  }

  return {
    latitude: center[1],
    longitude: center[0],
    countryCode,
  };
};
