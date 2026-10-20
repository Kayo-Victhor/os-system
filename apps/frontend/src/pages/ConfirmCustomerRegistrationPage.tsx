import { AuthLayout } from "../components/AuthLayout.tsx";
import { Button, ButtonLink } from "../components/Button.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { confirmCustomerRegistration } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { ErrorBanner, SuccessBanner } from "../components/States.tsx";

type ConfirmationState = "confirming" | "confirmed" | "invalid" | "temporary-error";

export function ConfirmCustomerRegistrationPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<ConfirmationState>(token ? "confirming" : "invalid");
  const [message, setMessage] = useState(
    token ? "Confirmando seu cadastro..." : "Este link de confirmação é inválido ou expirou.",
  );
  const submittedTokenRef = useRef<string | null>(null);

  const submitToken = useCallback((currentToken: string) => {
    if (submittedTokenRef.current === currentToken) return;
    submittedTokenRef.current = currentToken;

    void confirmCustomerRegistration(currentToken)
      .then((result) => {
        setState("confirmed");
        setMessage(result.message);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
          setState("invalid");
          setMessage("Este link é inválido, expirou ou já foi utilizado.");
          return;
        }

        setState("temporary-error");
        setMessage("Não foi possível confirmar o cadastro agora. Tente novamente.");
      });
  }, []);

  useEffect(() => {
    if (!token) return;

    let active = true;
    // StrictMode cancels its development probe before this microtask runs,
    // preventing two one-time confirmation requests for the same link.
    queueMicrotask(() => {
      if (active) submitToken(token);
    });

    return () => {
      active = false;
    };
  }, [submitToken, token]);

  function retry() {
    if (!token) return;
    submittedTokenRef.current = null;
    setState("confirming");
    setMessage("Confirmando seu cadastro...");
    submitToken(token);
  }

  return (
    <AuthLayout area="customer" variant="message" feedbackKey={message}>
      <div className="auth-form-content" aria-live="polite">
        <h1>Confirmação de cadastro</h1>

        {state === "confirming" && (
          <p className="page-subtitle" role="status">
            <span className="spinner" /> {message}
          </p>
        )}
        {state === "confirmed" && <SuccessBanner message={message} />}
        {(state === "invalid" || state === "temporary-error") && (
          <ErrorBanner message={message} />
        )}

        {state === "confirmed" && (
          <ButtonLink to="/customer/login">Ir para o login</ButtonLink>
        )}
        {state === "temporary-error" && (
          <Button type="button" onClick={retry}>
            Tentar novamente
          </Button>
        )}
        {state === "invalid" && (
          <p className="page-subtitle">
            <Link to="/registrar">Solicitar um novo cadastro</Link>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
