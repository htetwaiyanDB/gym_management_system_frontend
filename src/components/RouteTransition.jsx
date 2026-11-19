import { Suspense } from "react";
import { useLocation } from "react-router-dom";
import "./RouteTransition.css";

export function AppRouteLoader() {
  return (
    <div className="app-route-loader" role="status" aria-live="polite" aria-label="Loading page">
      <div className="app-route-loader__card">
        <span className="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
        <span>Loading page...</span>
      </div>
    </div>
  );
}

function RouteContentLoader() {
  return (
    <div className="route-content-loader" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
      <span className="visually-hidden">Loading page...</span>
    </div>
  );
}

export default function RouteTransition({ children }) {
  const location = useLocation();

  return (
    <div className="route-transition-shell">
      <Suspense fallback={<RouteContentLoader />}>
        <div className="route-page-enter" key={location.key}>
          {children}
        </div>
      </Suspense>
    </div>
  );
}
