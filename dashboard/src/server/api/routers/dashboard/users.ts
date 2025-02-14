import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const usersRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findUnique({
        where: {
          id: input.id,
        },
        include: {
          paymentMethodLinks: {
            include: {
              paymentMethod: {
                include: {
                  address: {
                    include: {
                      location: true,
                    },
                  },
                  card: true,
                },
              },
            },
          },
          deviceLinks: {
            include: {
              device: true,
            },
          },
          ipAddressLinks: {
            include: {
              ipAddress: {
                include: {
                  location: true,
                },
              },
            },
          },
        },
      });
    }),
});
