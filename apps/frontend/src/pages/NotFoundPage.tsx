import { Link } from "react-router-dom";
import { EmptyState } from "../components/States.tsx";

export function NotFoundPage() {
  return (
    <div className="page-content">
      <EmptyState
        title="Página não encontrada"
        description="A página que você procura não existe ou foi movida."
        action={
          <Link to="/" className="btn btn-primary">
            Voltar ao painel
          </Link>
        }
      />
    </div>
  );
}
