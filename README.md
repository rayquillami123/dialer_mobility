# Dialer Mobilitytech

Dialer Mobilitytech is an enterprise-grade, intelligent outbound dialing platform built on a modern, scalable, and observable technology stack. It is designed as a multi-tenant SaaS solution, ready for high-availability production environments and complex telecommunication workflows.

This platform provides a robust engine for managing outbound calling campaigns, with a strong focus on regulatory compliance, operational efficiency, and real-time performance monitoring.

## Core Features

-   **Intelligent Dialing Engine**: Features dynamic auto-protection to manage abandon rates, health-based trunk failover for high availability, and integrated compliance for dialing windows and Safe Harbor rules.
-   **Multi-tenant SaaS Architecture**: Ensures complete data isolation per tenant, with a robust JWT + HttpOnly refresh token authentication system and Role-Based Access Control (RBAC) for granular permissions.
-   **360° Observability**: Provides real-time dashboards for monitoring key performance indicators (KPIs) like abandon rates, DID/trunk health, and call statistics. A resilient WebSocket system with heartbeats and automatic reconnection powers the live data feeds.
-   **Production-Ready Operations**: Comes with custom Prometheus metrics, predefined alert rules for critical KPIs, a database backup strategy, and comprehensive deployment manifests for both Docker Compose and Kubernetes (via Helm).
-   **Professional User Experience (UX)**: A complete user onboarding flow (invite, accept, reset password), a dashboard with global alerts for critical events, and a clear session status widget to monitor user sessions.
-   **AI-Powered Integrations**: Leverages Genkit and Google AI to provide advanced capabilities, such as generating integration guides and technical notes on-the-fly.

## Tech Stack

-   **Frontend**: Next.js, React, TypeScript, ShadCN UI, Tailwind CSS, Zustand
-   **Backend**: Node.js, Express, PostgreSQL, WebSocket (ws)
-   **Telephony**: FreeSWITCH (with `mod_event_socket`, `mod_json_cdr`, `mod_callcenter`)
-   **AI/Generative**: Genkit, Google AI (Gemini)
-   **DevOps**: Docker, Kubernetes (Helm), GitHub Actions for CI/CD

## Getting Started

### Prerequisites

-   Git
-   Docker and Docker Compose
-   Node.js and npm (for using the admin CLI)

### 1. Clone the Repository

```bash
git clone https://github.com/ORG/dialer.git
cd dialer
```

### 2. Installation and Setup

The project includes a convenient installation script that guides you through the setup process.

```bash
./ops/install.sh
```

This script will:
1.  Ask for your preferred deployment mode (e.g., with an embedded FreeSWITCH or connecting to an external one).
2.  Generate a `.env` file from a preset.
3.  Generate a secure token for the CDR ingest endpoint.
4.  Install backend dependencies.
5.  Build the required Docker images and start the services using Docker Compose.

### 3. Bootstrap the First Admin User

For security, the system is bootstrapped with an initial administrator account using a one-time, token-protected endpoint.

First, set the required environment variables in your shell:

```bash
export API_URL="http://localhost:8080"
# This token must match the BOOTSTRAP_TOKEN in your backend/.env file
export BOOTSTRAP_TOKEN="pon_un_token_unico_y_largo"
```

Then, run the following `curl` command to create the tenant and the admin user:

```bash
curl -X POST "$API_URL/api/auth/bootstrap" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $BOOTSTRAP_TOKEN" \
  -d '{
    "tenantName": "MobilityTech",
    "adminEmail": "admin@example.com",
    "adminPassword": "Cambialo!2025",
    "roles": ["admin","supervisor"]
  }'
```

After the first successful bootstrap, this endpoint is automatically disabled.

### 4. Access the Application

-   **Frontend UI**: Open [http://localhost:3000](http://localhost:3000) in your browser.
-   **Backend API**: The API is accessible at [http://localhost:8080](http://localhost:8080).

You can now log in with the credentials you just created:
-   **Email**: `admin@example.com`
-   **Password**: `Cambialo!2025`

## Project Structure

```
.
├── backend/              # Node.js backend (API, Orchestrator, ESL connector)
├── freeswitch/           # FreeSWITCH configuration files
├── helm/                 # Helm chart for Kubernetes deployment
├── k8s/                  # Raw Kubernetes manifests
├── ops/                  # Operational scripts (backups, CLI, smoke tests)
├── public/               # Static assets for the frontend
├── src/                  # Next.js frontend source code
│   ├── app/              # App Router, pages, and layouts
│   ├── components/       # React components (UI and domain-specific)
│   ├── hooks/            # Custom React hooks (e.g., useAuth, useDialerWS)
│   ├── lib/              # Shared libraries and utilities
│   └── store/            # Global state management (Zustand)
├── docker-compose.fs.yml # Docker Compose file with embedded FreeSWITCH
├── next.config.ts        # Next.js configuration
└── package.json          # Frontend dependencies and scripts
```

## Administration CLI

The project includes a powerful admin CLI for managing tenants and users without needing to re-enable the bootstrap endpoint.

**Location**: `ops/cli/admin.mjs`

**Usage Examples**:

First, make the script executable:
`chmod +x ops/cli/admin.mjs`

```bash
# Log in to obtain a session token (required for subsequent commands)
node ops/cli/admin.mjs --api http://localhost:8080 login -e admin@example.com -p 'Cambialo!2025'

# Invite a new user to a tenant
node ops/cli/admin.mjs --api http://localhost:8080 invite-user -e admin@example.com -p 'Cambialo!2025' -t MobilityTech --invite new.agent@example.com

# Change a user's role
node ops/cli/admin.mjs --api http://localhost:8080 set-role -e admin@example.com -p 'Cambialo!2025' -t MobilityTech --target new.agent@example.com -r supervisor
```

For more commands, run `node ops/cli/admin.mjs --help`.

## Deployment

The application is designed for containerized deployments and provides manifests for:

-   **Docker Compose**: Ideal for development and small-scale deployments. Use `docker-compose.fs.yml` for an all-in-one setup or `docker-compose.ext.yml` to connect to an external PBX.
-   **Kubernetes (Helm)**: A complete Helm chart is available in the `helm/dialer` directory for scalable, production-grade deployments. It supports high availability, custom resource configuration, and integration with Prometheus for monitoring.

Refer to `helm/dialer/values.yaml` for configuration options.
