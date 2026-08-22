import { Prisma } from "../generated/prisma/client.js";

export interface KnownErrorResponse {
  status: number;
  body: { error: string };
}

/**
 * Maps common Prisma known-request errors to safe, user-facing responses.
 * Returns null when the error isn't one we specifically handle, so the
 * caller can fall back to a generic 500 + server-side log.
 */
export function mapPrismaError(error: unknown): KnownErrorResponse | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  switch (error.code) {
    case "P2002": {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : "campo";

      return {
        status: 409,
        body: { error: `Já existe um registro com este ${target}` },
      };
    }
    case "P2025":
      return {
        status: 404,
        body: { error: "Registro não encontrado" },
      };
    case "P2003":
      return {
        status: 409,
        body: {
          error:
            "Não foi possível concluir a operação: um registro relacionado não existe ou ainda está sendo referenciado por outros dados",
        },
      };
    default:
      return null;
  }
}
