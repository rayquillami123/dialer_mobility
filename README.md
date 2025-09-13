# Dialer Mobilitytech

This is a Next.js-based intelligent dialer application, built with a Node.js backend, PostgreSQL, and FreeSWITCH. It's designed for scalability, observability, and enterprise-grade operations.

## Quickstart (Docker)
```bash
git clone https://github.com/ORG/dialer.git
cd dialer
./ops/install.sh         # elige: 1) Embedded FS o 2) Externo
# abrir http://localhost:3000  (API: http://localhost:8080)
```

## Quickstart (Kubernetes con Helm)
```bash
helm upgrade --install dialer ./helm/dialer \
  --namespace dialer --create-namespace \
  --set env.JWT_ACCESS_SECRET=$(openssl rand -hex 32) \
  --set env.JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
  --set ingress.hosts.api=api.tudominio.com \
  --set ingress.hosts.app=app.tudominio.com
```

## Core Features

-   **Intelligent Dialing Engine**: Features dynamic auto-protection, health-based trunk failover, and integrated compliance for dialing windows and Safe Harbor rules.
-   **Multi-tenant SaaS Architecture**: Complete data isolation per tenant, with a robust JWT + HttpOnly refresh token authentication system and Role-Based Access Control (RBAC).
-   **360° Observability**: Real-time dashboards for monitoring abandonment rates, DID/trunk health, and a resilient WebSocket system with heartbeats and automatic reconnection.
-   **Production-Ready Operations**: Comes with custom Prometheus metrics, predefined alert rules, a backup strategy, and comprehensive deployment manifests for both Docker Compose and Kubernetes.
-   **Professional User Experience (UX)**: A complete user onboarding flow (invite, accept, reset password), a dashboard with global alerts, and a clear session status widget.
