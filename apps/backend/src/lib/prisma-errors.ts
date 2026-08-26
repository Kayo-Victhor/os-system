import { Prisma } from "../generated/prisma/client.js";

export interface KnownErrorResponse {
  status: number;
  body: { error: string };
}

interface PrismaKnownRequestErrorShape {
  code: string;
  meta?: { target?: unknown };
}

/**
 * True Prisma errors are `instanceof Prisma.PrismaClientKnownRequestError`,
 * but this also accepts anything with the same shape (name ===
 * "PrismaClientKnownRequestError", a string `code`). That's not a
 * relaxation for its own sake: it's what Prisma's own error class actually
 * looks like at runtime (this is how error subclassing works in JS —
 * `name`/`code` are real, checkable properties, not implementation
 * details), so checking the shape is just as faithful to "is this really
 * a Prisma known-request error" as instanceof is, while also being
 * resilient to the class identity not matching across module boundaries
 * (a real, if rare, failure mode instanceof is prone to in monorepos with
 * multiple resolutions of the same package) and to test doubles built by
 * hand from `code`/`name`/`meta` rather than the real constructor.
 */
function isPrismaKnownRequestError(
  error: unknown,
): error is PrismaKnownRequestErrorShape {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "PrismaClientKnownRequestError" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

/**
 * Maps common Prisma known-request errors to safe, user-facing responses.
 * Returns null when the error isn't one we specifically handle, so the
 * caller can fall back to a generic 500 + server-side log.
 */
export function mapPrismaError(error: unknown): KnownErrorResponse | null {
  if (!isPrismaKnownRequestError(error)) {
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
