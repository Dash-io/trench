import type { NextApiRequest, NextApiResponse } from "next";
import { hashComponents, sources } from "@fingerprintjs/fingerprintjs";
import jwt from "jsonwebtoken";
import { mapValues } from "lodash";
import { userAgentFromString } from "next/server";
import { z } from "zod";
import { env } from "~/env.mjs";
import { getIpData, maxMind } from "~/server/lib/maxMind";
import { prisma } from "../../server/db";
import cors from "nextjs-cors";
import { UserFlow } from "../../common/types";

const componentSchema = z.object({
  value: z.any(),
  error: z.any(),
  duration: z.number(),
});

const deviceSchema = z.object({
  sessionId: z.string(),
  deviceToken: z.string().optional(),
  fingerprintComponents: z.object({
    ...mapValues(sources, () => componentSchema),
  }),
  fingerprint2Components: z.object({
    hasLiedLanguages: z.boolean(),
    hasLiedResolution: z.boolean(),
    hasLiedBrowser: z.boolean(),
    hasLiedOs: z.boolean(),
    userAgent: z.string().optional(),
  }),
  isIncognito: z.boolean(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await cors(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const response = deviceSchema.safeParse(req.body);

  if (!response.success) {
    return res.status(400).json({
      error: { message: "Invalid request" },
    });
  }

  const {
    deviceToken,
    fingerprintComponents,
    fingerprint2Components,
    isIncognito,
    sessionId,
  } = response.data;

  let existingDeviceId;
  if (deviceToken) {
    try {
      const { deviceId } = jwt.verify(deviceToken, env.JWT_SECRET) as {
        deviceId?: string;
      };
      if (deviceId) existingDeviceId = deviceId;
    } catch (error) {
      console.error(error);
    }
  }

  const ipAddress =
    env.NODE_ENV === "development"
      ? "99.120.79.196"
      : (req.headers["x-forwarded-for"] as string | undefined);

  let existingIpAddress;
  if (ipAddress) {
    existingIpAddress = await prisma.ipAddress.findUnique({
      where: { ipAddress },
      select: { id: true },
    });
  }

  const userAgentData = userAgentFromString(fingerprint2Components.userAgent);

  const session = await prisma.session.upsert({
    where: { customId: sessionId },
    update: {},
    create: {
      customId: sessionId,
      userFlow: {
        connectOrCreate: {
          where: {
            name: UserFlow.StripePayment,
          },
          create: {
            name: UserFlow.StripePayment,
          },
        },
      },
      deviceSnapshot: {
        create: {
          fingerprint: hashComponents(fingerprintComponents),
          userAgent: fingerprint2Components.userAgent,
          browserName: userAgentData.browser.name,
          browserVersion: userAgentData.browser.version,
          deviceModel: userAgentData.device.model,
          deviceType: userAgentData.device.type,
          deviceVendor: userAgentData.device.vendor,
          engineName: userAgentData.engine.name,
          engineVersion: userAgentData.engine.version,
          osName: userAgentData.os.name,
          osVersion: userAgentData.os.version,
          cpuArchitecture: userAgentData.cpu.architecture,
          isIncognito,
          reqUserAgent: req.headers["user-agent"],
          screenResolution: Array.isArray(
            fingerprintComponents.screenResolution.value
          )
            ? fingerprintComponents.screenResolution.value.join("x")
            : undefined,
          timezone:
            typeof fingerprintComponents.timezone.value === "string"
              ? fingerprintComponents.timezone.value
              : undefined,
          device: existingDeviceId
            ? {
                connectOrCreate: {
                  where: { id: existingDeviceId },
                  create: {},
                },
              }
            : { create: {} },
          ipAddress: existingIpAddress
            ? { connect: { id: existingIpAddress.id } }
            : ipAddress
            ? { create: { ipAddress } }
            : undefined,
          metadata: {
            ...fingerprintComponents,
            ...fingerprint2Components,
          },
        },
      },
    },
    include: {
      deviceSnapshot: true,
    },
  });

  if (!session.deviceSnapshot) throw new Error("No device snapshot");

  const { deviceId } = session.deviceSnapshot;
  const token = jwt.sign({ deviceId }, env.JWT_SECRET);

  res.status(200).json({ deviceId, deviceToken: token });
}
