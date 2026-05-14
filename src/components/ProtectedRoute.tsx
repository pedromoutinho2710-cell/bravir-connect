import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
import { ReactNode, useEffect, useState } from "react";

interface Props {
  children: ReactNode;
  allow?: AppRole[];
}

export default function ProtectedRoute({ children, allow }: Props) {
  const { user, role, loading, roleLoaded } = useAuth();
  const location = useLocation();

  const [initialLoadDone, setInitialLoadDone] = useState(false);

  useEffect(() => {
    if (!loading && roleLoaded) {
      setInitialLoadDone(true);
    }
  }, [loading, roleLoaded]);

  if (!initialLoadDone && (loading || !roleLoaded)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (allow && role && !allow.includes(role)) {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }

  return <>{children}</>;
}
