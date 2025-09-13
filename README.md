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
-   `curl` and `jq` for testing and setup.

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
2.  Generate a `.env` file from a preset, including a secure `BOOTSTRAP_TOKEN`.
3.  Generate a secure token for the CDR ingest endpoint and inject it into the FreeSWITCH configuration.
4.  Install backend and frontend dependencies.
5.  Build the required Docker images and start the services using Docker Compose.

### 3. Bootstrap the First Admin User

For security, the system is bootstrapped with an initial administrator account using a **one-time, token-protected endpoint**. After the first successful use, this endpoint is automatically disabled.

First, set the required environment variables in your shell:

```bash
# This is the API URL configured in your .env file
export API_URL="http://localhost:8080"
# This token must match the BOOTSTRAP_TOKEN in your backend/.env file
export BOOTSTRAP_TOKEN="$(grep BOOTSTRAP_TOKEN .env | cut -d '=' -f2)"
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

If successful, you will see `{"ok":true,...}`. You can now proceed to log in. If you see `{"error":"bootstrap already used"}`, it means the system is already initialized.

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
│   ├── cli/              # Admin CLI for user/tenant management
│   ├── install.sh        # Main installation script
│   └── ...
├── public/               # Static assets for the frontend
├── src/                  # Next.js frontend source code
│   ├── app/              # App Router, pages, and layouts
│   ├── components/       # React components (UI and domain-specific)
│   ├── hooks/            # Custom React hooks (e.g., useAuth, useDialerWS)
│   ├── lib/              # Shared libraries and utilities
│   └── store/            # Global state management (Zustand)
├── docker-compose.fs.yml # Docker Compose file with embedded FreeSWITCH
└── package.json          # Frontend dependencies and scripts
```

## Administration CLI

After the initial bootstrap, the primary way to manage tenants and users is through the powerful admin CLI, which uses the API with proper authentication.

**Location**: `ops/cli/admin.mjs`

**Usage Examples**:

First, make the script executable:
`chmod +x ops/cli/admin.mjs`

```bash
# Log in to obtain a session token (required for subsequent commands)
# The CLI automatically handles token refresh.
node ops/cli/admin.mjs --api http://localhost:8080 login -e admin@example.com -p 'Cambialo!2025'

# Invite a new user to a tenant
node ops/cli/admin.mjs --api http://localhost:8080 invite-user -e admin@example.com -p 'Cambialo!2025' -t MobilityTech --invite new.agent@example.com

# Change a user's role
node ops/cli/admin.mjs --api http://localhost:8080 set-role -e admin@example.com -p 'Cambialo!2025' -t MobilityTech --target new.agent@example.com -r supervisor

# List all users in a tenant
node ops/cli/admin.mjs --api http://localhost:8080 list-users -e admin@example.com -p 'Cambialo!2025' -t MobilityTech
```

For more commands, run `node ops/cli/admin.mjs --help`.

## Deployment

### Docker Compose
Ideal for development and small-scale deployments.
-   `docker-compose.fs.yml`: All-in-one setup with an embedded FreeSWITCH instance.
-   `docker-compose.ext.yml`: For connecting to an external PBX like FusionPBX or Asterisk.

### Kubernetes (Helm)
A complete Helm chart is available in the `helm/dialer` directory for scalable, production-grade deployments. It supports high availability, custom resource configuration, and integration with Prometheus for monitoring. Refer to `helm/dialer/values.yaml` for all configuration options.

## Production Readiness

### Go-Live Checklist

-   [ ] **Secrets**: Rotate `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `BOOTSTRAP_TOKEN` with unique, long values for your production environment.
-   [ ] **CORS**: Set `CORS_ORIGIN` in your backend `.env` to allow only your valid frontend domain(s).
-   [ ] **Disable Bootstrap**: Set `DISABLE_BOOTSTRAP=true` in your production environment variables to permanently disable the bootstrap endpoint after its first use.
-   [ ] **Database**: Run all migrations and confirm key indexes exist (e.g., on `cdr.tenant_id`, `cdr.received_at`).
-   [ ] **Observability**: Verify Prometheus is scraping `/api/metrics` and load the alert rules from `ops/prometheus/alerts_dialer.yml`.
-   [ ] **Backups**: Confirm the daily database backup job is active and perform at least one full restoration test.

### Smoke Tests (Quick Verification)

After each deployment, run the automated smoke test to validate critical components (Auth, API, WebSocket).

```bash
# Ensure environment variables are set
export API_URL="https://your.api.domain"
export EMAIL="admin@example.com"
export PASS="your-secure-password"

# Run the test
node backend/ops/smoke/smoke.mjs
```

A `SMOKE OK` result indicates that all core functionalities are operational.

### Database Backups
A backup script `ops/backup/pg_backup.sh` is provided. It can be run as a cron job inside a container or on the host to perform daily dumps of the PostgreSQL database.

## Integrating with External PBX Systems

The Dialer is designed to act as a powerful outbound engine that can feed calls to your existing agent infrastructure.

- **FusionPBX**:
    1.  Use `docker-compose.ext.yml` (or configure your Helm chart) to run the dialer without the local FreeSWITCH container.
    2.  Set `ESL_HOST` in your `.env` to point to your FusionPBX IP address.
    3.  In FusionPBX, enable the Event Socket and adjust the ACL to allow connections from the dialer's backend IP.
    4.  Configure `mod_json_cdr` in FusionPBX to POST CDRs to your dialer's `/cdr` endpoint.
    5.  The dialer will originate calls and transfer them to your existing FusionPBX queues or extensions.

- **Issabel/Asterisk**:
    - **Option A (SIP Trunk)**: Configure a SIP trunk from the dialer's FreeSWITCH (or an intermediate SBC) to Issabel. The dialer originates calls, and Issabel routes them to your agents. This is simpler but provides less real-time visibility.
    - **Option B (AMI Bridge)**: For real-time agent status, use the provided `ops/bridges/asterisk-ami-bridge.js`. This script connects to the Asterisk Manager Interface (AMI), listens for events (e.g., `AgentLogin`, `QueueMemberStatus`), and forwards them to your dialer's backend via HTTP. This allows the UI to reflect agent states accurately.

- **MagnusBilling**:
    1. Configure a SIP gateway in FreeSWITCH (`sofia.conf.xml`) that points to your MagnusBilling instance.
    2. The dialer's orchestrator originates calls through this gateway.
    3. MagnusBilling handles the final routing and billing, while the dialer's backend still receives real-time CDRs from FreeSWITCH for observability.

## High-Capacity Architecture (2,000+ Channels)

To scale beyond a single-node setup, the recommended architecture involves:

-   **SBC (Kamailio/OpenSIPS)**: Acts as the front door for all SIP traffic, providing security, load balancing, and NAT traversal.
-   **Media Anchors (RTPengine)**: Handles RTP media streams, offloading the media processing from FreeSWITCH.
-   **FreeSWITCH Media Nodes**: A cluster of stateless FreeSWITCH servers that execute the dialing logic (AMD, transfers). They can be scaled horizontally.
-   **Orchestrator**: The backend Node.js service becomes a smart dispatcher, distributing call origination requests across the available FreeSWITCH nodes based on health and load.
-   **HA Database**: A PostgreSQL cluster with read replicas to handle the high volume of reporting and analytics queries.

For detailed tuning parameters for the OS, network, and FreeSWITCH, refer to the