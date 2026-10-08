<!-- Copied verbatim from the claude.ai Project doc "MVP Product & Technical Design Document" (v0.1) on 2026-10-08, so the repo is self-contained. Later architecture decisions refine it: see BOOTSTRAP_REPORT.md and DECISIONS.md. -->

Cloud Engineer Simulator

**Working title:** Cloud Engineer Simulator  
**Product family:** NetSim ecosystem  
**Initial cloud provider:** Microsoft Azure  
**Initial hosting:** GitHub Pages  
**Target:** Fully playable browser-based MVP  
**Document version:** 0.1

---

# 1. Product Vision

Create a browser-based **Cloud Engineer / Cloud Architect simulation game** that teaches users cloud engineering from beginner to advanced level through realistic, hands-on work.

The player should not feel like they are taking an online course.

They should feel like they have been hired as a **Cloud Engineer / DevOps Engineer** and are responsible for real client environments.

The central philosophy is:

> **Learn Cloud by building it, operating it, breaking it, troubleshooting it, and improving it.**

The game should combine:

```text
Cloud Learning
      +
Infrastructure Building
      +
Visual Architecture
      +
CLI / Portal / IaC
      +
GitHub Actions
      +
Monitoring
      +
Troubleshooting
      +
Client Projects
      +
Gamification
```

The long-term objective is to take a complete beginner from:

```text
"I don't know what a VNet is."
```

to:

```text
"I can design, deploy, secure, automate,
monitor and troubleshoot a production-grade
Azure environment."
```

---

# 2. Relationship to NetSim

This project is a **separate project from Network Engineer Simulator (NetSim)**.

They should share the same overall philosophy, design language, UX principles and potentially some reusable UI technology, but they are technically separate applications.

```text
                         Infrastructure Learning
                                Platform
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
             NetSim                         Cloud Engineer Simulator
                │                                     │
       Network Engineering                     Cloud Engineering
       On-Prem / Networking                    Azure / Cloud Native
       CLI / Network Devices                   Portal / CLI / IaC
       Routing / Switching                     Architecture
       Troubleshooting                         DevOps / CI/CD
                │                                     │
                └──────────── Shared Philosophy ──────┘
```

Do **not** tightly couple the two projects.

The architecture should leave room for future products such as:

```text
NetSim
Cloud Engineer Simulator
DevOps Simulator
Kubernetes Simulator
Security Engineer Simulator
Platform Engineer Simulator
```

---

# 3. Core Product Philosophy

The simulator should follow these principles.

## 3.1 Authentic, but simplified

The product is **not an exact copy of the Azure Portal**.

It should be:

> **A simplified but authentic Azure environment.**

Use real Azure terminology, real resource concepts, realistic dependencies, realistic failures and realistic engineering workflows.

Avoid inventing fictional cloud concepts where a real Azure concept exists.

For example:

Good:

```text
Virtual Network
Subnet
Network Security Group
Managed Identity
Resource Group
Storage Account
Container Registry
Container Apps
Azure Monitor
Log Analytics
```

Bad:

```text
Magic Network
Cloud Storage Box
Super Identity
Data Vault
```

The player should finish the game with knowledge that transfers to real Azure.

---

# 4. The Core Gameplay Loop

The entire game revolves around:

```text
CLIENT
  ↓
CLIENT REQUIREMENT / TICKET
  ↓
INVESTIGATE
  ↓
PLAN
  ↓
BUILD
  ↓
CONFIGURE
  ↓
DEPLOY
  ↓
VALIDATE
  ↓
GO LIVE
  ↓
MONITOR
  ↓
INCIDENT
  ↓
TROUBLESHOOT
  ↓
FIX
  ↓
IMPROVE
  ↓
CLIENT SIGN-OFF
  ↓
NEXT QUEST
```

This is the most important loop in the game.

The user should repeatedly experience:

> "I built this infrastructure, and now I am responsible for it."

---

# 5. The Defining Feature — Infrastructure Visualization

The infrastructure visualization is the heart of the product.

It should not be a decorative diagram.

The visualization is a **live representation of the simulated infrastructure state**.

Every resource the player creates should appear on the architecture canvas.

For example:

```text
                         INTERNET
                             │
                             ▼
                    ┌─────────────────┐
                    │ Application     │
                    │ Gateway / WAF   │
                    └────────┬────────┘
                             │
                     ┌───────┴───────┐
                     │               │
                     ▼               ▼
                ┌─────────┐     ┌─────────┐
                │ Game API│     │ Game API│
                │ Instance│     │ Instance│
                └────┬────┘     └────┬────┘
                     │               │
                     └───────┬───────┘
                             ▼
                       ┌───────────┐
                       │ Database  │
                       └───────────┘
```

The visualization should communicate:

- What exists.
- Where it exists.
- What depends on what.
- How resources communicate.
- Network boundaries.
- Resource health.
- Errors.
- Traffic.
- Security problems.
- Deployment state.
- Dependencies.

A resource should be visually different when:

```text
Healthy
Warning
Degraded
Failed
Deploying
Stopped
Blocked
Unauthorized
```

The architecture should feel alive.

---

# 6. One Underlying Infrastructure State

A critical architectural principle:

**Everything in the application must operate against the same infrastructure state.**

The visual canvas, portal, CLI, Bicep, pipeline, monitoring and failure engine must not each maintain separate representations.

Conceptually:

```text
                    ┌──────────────┐
                    │ Infrastructure│
                    │   State       │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      Visualizer         Portal            CLI
          │                │                │
          └────────────────┼────────────────┘
                           │
                      Resource Engine
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
        Bicep          Pipelines        Monitoring
                           │
                      Failure Engine
```

For example:

If the player blocks TCP/443 using an NSG:

- The architecture should show the affected path.
- The application should become unreachable.
- Monitoring should produce an alert.
- Logs should show connection failures.
- The terminal should reflect the state.
- A later diagnostic quest should be able to detect the problem.

This is what makes the simulator a **simulation**, rather than a diagram editor.

---

# 7. Azure Simulation Model

The MVP will **not deploy to real Azure**.

Instead, the browser contains a simulated Azure environment that follows real Azure concepts.

The long-term product can eventually support:

```text
                    Cloud Engineer Simulator
                              │
                 ┌────────────┴────────────┐
                 │                         │
          Simulation Mode            Real Azure Mode
                 │                         │
             Browser                  Azure Sandbox
```

Real Azure deployment should be an **end-stage feature**, not an MVP requirement.

This is important because the initial game can:

- Run entirely in the browser.
- Be hosted on GitHub Pages.
- Avoid cloud infrastructure costs.
- Avoid requiring users to connect Azure subscriptions.
- Avoid security problems.
- Allow safe experimentation.
- Allow us to intentionally simulate failures.

---

# 8. GitHub Pages MVP Architecture

GitHub Pages is appropriate for the first version because it hosts static HTML/CSS/JavaScript applications directly from a repository. It does not provide a traditional server-side runtime, so the MVP must be designed as a browser-side application. GitHub also recommends GitHub Actions for custom build/deployment workflows.

Target architecture:

```text
GitHub Repository
        │
        ▼
GitHub Actions
        │
        ├── Build
        ├── Test
        └── Deploy
        │
        ▼
GitHub Pages
        │
        ▼
Browser
        │
        ├── UI
        ├── Simulation Engine
        ├── Azure Resource Model
        ├── Mission Engine
        ├── Monitoring Engine
        ├── Failure Engine
        ├── CLI
        ├── Bicep Editor
        └── GitHub Actions Simulator
```

Persistence for MVP:

```text
Browser
   │
   ├── LocalStorage
   └── IndexedDB
```

The game should save:

- Progress.
- Completed quests.
- Infrastructure state.
- Settings.
- Difficulty/learning mode.
- Player level.
- Selected client projects.

---

# 9. Learning Modes

The simulator should support different levels of assistance.

## Guided Mode

Designed for complete beginners.

The game should:

- Highlight relevant resources.
- Point toward buttons.
- Explain where to click.
- Show hints.
- Provide contextual descriptions.
- Show "Why are we doing this?"
- Provide suggested next steps.
- Warn before potentially dangerous actions.

Example:

```text
Create a VNet

[+ Create Resource]

        ↑
        Game highlights the button

INFO:
"A Virtual Network is your private network
inside Azure. Think of it like creating the
network infrastructure inside your own datacenter."
```

---

## Standard Mode

The player receives:

- Client requirements.
- Acceptance criteria.
- Limited hints.
- Info buttons.
- Monitoring information.

The player is expected to determine the implementation.

---

## Expert Mode

The game gives the player mostly:

```text
Client requirement
+
Constraints
+
Budget
+
SLA
+
Security requirements
```

The player must design the solution.

Hints can still be requested, but they may reduce the final score.

---

# 10. Contextual "INFO" System

Every complex concept should have an accessible **INFO** button.

Examples:

```text
[ INFO ]
VNet
```

Opening it should provide:

### What is it?

Simple explanation.

### Why does it exist?

The problem it solves.

### How does Azure use it?

Real Azure context.

### What does it connect to?

Dependencies and relationships.

### Common mistakes

Typical beginner errors.

### Real-world usage

A practical example.

### Related concepts

```text
VNet
 ├── Subnet
 ├── NSG
 ├── Route Table
 ├── Private Endpoint
 ├── VNet Peering
 └── VPN Gateway
```

### Certification relevance

For example:

```text
AZ-104
AZ-700
```

The INFO system should never become a giant textbook.

The default explanation should be brief.

A deeper explanation can be opened when needed.

---

# 11. Player Progression

The player should have an explicit career progression.

Initial progression:

```text
Cloud Beginner
      ↓
Azure Foundations
      ↓
Junior Azure Administrator
      ↓
Azure Cloud Engineer
      ↓
Azure Network Engineer
      ↓
DevOps Engineer
      ↓
Senior Cloud Engineer
      ↓
Cloud Architect
```

This is primarily a gameplay/progression system, not an assertion that certification automatically makes someone qualified for the role.

---

# 12. Certification-Aligned Curriculum

The learning system should be mapped against the **current Microsoft Learn exam objectives**, and the mapping should be versioned because Microsoft periodically updates certification objectives.

Current objectives used as the initial source of truth:

### AZ-900 — Azure Fundamentals

Current areas include:

- Cloud concepts.
- Shared responsibility.
- Cloud models.
- Consumption-based pricing.
- IaaS/PaaS/SaaS.
- Azure architecture.
- Regions.
- Availability zones.
- Resources.
- Resource groups.
- Subscriptions.
- Compute.
- Networking.
- Storage.
- Identity.
- Security.
- Governance.
- Azure management.
- Monitoring.

### AZ-104 — Azure Administrator

Current areas include:

- Entra users and groups.
- RBAC.
- Subscriptions.
- Azure Policy.
- Resource locks.
- Tags.
- Cost management.
- Storage.
- VMs.
- VM Scale Sets.
- Containers.
- Container Apps.
- App Service.
- Bicep.
- VNets.
- Subnets.
- NSGs.
- Private Endpoints.
- DNS.
- Load balancing.
- Azure Monitor.
- Network Watcher.
- Backup and recovery.

### AZ-700 — Azure Network Engineer

Current objectives include:

- IP addressing.
- Network segmentation.
- VNets.
- Subnet design.
- DNS.
- VNet peering.
- Routing.
- UDRs.
- VPN.
- ExpressRoute.
- Application delivery.
- Load Balancer.
- Application Gateway.
- Front Door.
- NAT Gateway.
- Azure Firewall.
- WAF.
- Private Link / Private Endpoints.
- Network monitoring and diagnostics.

### AZ-400 — DevOps Engineer

Current objectives include:

- GitHub Flow.
- Git.
- Branching.
- Pull requests.
- Repository strategy.
- GitHub Actions.
- YAML pipelines.
- Build and release pipelines.
- Testing.
- Security/compliance.
- Deployment strategies.
- IaC.
- Bicep.
- Managed identities.
- Service principals.
- GitHub authentication.
- Monitoring.
- Pipeline maintenance and optimization.

### Future Architect Track

The longer-term architecture track should also incorporate concepts from **AZ-305**, including cloud and hybrid architecture, compute, networking, storage, monitoring, security, business continuity, disaster recovery, governance and Azure Well-Architected / Cloud Adoption Framework thinking.

---

# 13. Important Curriculum Rule

Do not design missions simply to check off certification bullet points.

Every topic should be converted into:

```text
Concept
   ↓
Hands-on action
   ↓
Real-world requirement
   ↓
Problem
   ↓
Troubleshooting
   ↓
Understanding
```

Example:

Instead of:

> "Learn what an NSG is."

Create:

> "Players report that they cannot connect to the game API. Find out why."

The player investigates:

```text
Network
   ↓
Subnet
   ↓
NSG
   ↓
Security Rule
   ↓
Port 443 blocked
   ↓
Fix rule
   ↓
Validate connectivity
```

The player learns what an NSG is because they **needed it**.

---

# 14. MVP Client Scenario

The first client should be a **small game studio**.

Working fictional client:

**PixelForge Games**

They are an indie game studio preparing to release their first online multiplayer game.

They currently have a poorly structured development environment and need a cloud platform for their game backend.

The player has been hired as the Cloud Engineer.

The client wants:

- A secure Azure environment.
- A game backend.
- Persistent game data.
- Storage for game assets.
- Containerized workloads.
- Monitoring.
- Logging.
- Basic scalability.
- Automated deployment.
- Secure identity.
- A maintainable infrastructure setup.

The player gradually builds the environment through multiple quests.

---

# 15. MVP Quest Campaign

The MVP should contain a small but complete campaign rather than trying to implement the entire Azure curriculum.

Suggested initial campaign:

## Quest 01 — Welcome to Azure

Teach:

- Cloud concepts.
- Azure hierarchy.
- Subscription.
- Resource group.
- Region.
- Resource.
- Portal navigation.

Objective:

> PixelForge has received its Azure environment. Organize the foundation correctly.

Player creates:

```text
Subscription
    │
    └── Resource Group
            │
            ├── Resources
            └── Tags
```

---

## Quest 02 — The Game Needs a Home

Teach:

- Compute concepts.
- IaaS vs PaaS.
- App Service.
- Basic deployment.
- Scaling.

Objective:

> PixelForge needs a web/API service to host the game backend.

Player must select an appropriate Azure compute solution.

The game should explain why different choices exist.

---

## Quest 03 — Build the Network

Teach:

- VNet.
- Subnets.
- Address spaces.
- NSGs.
- Public/private connectivity.

Objective:

> The client wants the game backend separated from other workloads.

Player builds:

```text
VNet
 │
 ├── Web/API Subnet
 │
 └── Private Services Subnet
```

---

## Quest 04 — Store the Game Data

Teach:

- Storage Accounts.
- Blob Storage.
- Containers.
- Access control.
- Redundancy.
- Storage tiers.

Player configures game asset storage and learns why different storage options exist.

---

## Quest 05 — Containerize the Game API

Teach:

- Containers.
- Azure Container Registry.
- Azure Container Apps.
- Container images.
- Environment configuration.
- Scaling.

Player builds:

```text
GitHub
   ↓
GitHub Actions
   ↓
Container Build
   ↓
Azure Container Registry
   ↓
Azure Container App
```

---

## Quest 06 — Secure the Environment

Teach:

- Microsoft Entra ID.
- RBAC.
- Managed Identity.
- Service principals.
- Least privilege.

The player must give resources exactly the permissions they need.

Example:

```text
Container App
      │
      │ Managed Identity
      ▼
Container Registry
      │
      │ Pull image
      ▼
Container
```

Introduce the difference between:

```text
Authentication
Authorization
Managed Identity
Service Principal
RBAC
```

---

## Quest 07 — Make It Observable

Teach:

- Azure Monitor.
- Log Analytics.
- Application Insights.
- Metrics.
- Logs.
- Alerts.
- Action Groups.

The player builds a monitoring dashboard.

Example:

```text
GAME API

Requests        12,440/min
Latency         130 ms
Errors          0.8%
CPU             42%
Memory          51%
Availability    99.92%
```

---

## Quest 08 — Build the Deployment Pipeline

Teach:

- Git.
- Branches.
- Pull Requests.
- GitHub Actions.
- YAML.
- Build.
- Test.
- Deploy.
- Environment variables.
- Authentication.

Example:

```text
Developer
   ↓
Git Push
   ↓
GitHub
   ↓
GitHub Actions
   │
   ├── Checkout
   ├── Validate
   ├── Test
   ├── Build
   ├── Security Check
   └── Deploy
           ↓
      Azure Container App
```

---

## Quest 09 — Something Is Broken

The environment is now running.

The player receives:

> "Players are reporting that the game is unavailable."

The player must investigate.

Possible causes:

- Container crashed.
- Incorrect image.
- Bad environment variable.
- NSG rule.
- Failed deployment.
- Resource unavailable.
- Authentication failure.

The player uses:

```text
Monitoring
Logs
Metrics
Activity Logs
Architecture
CLI
Resource configuration
```

to identify the root cause.

---

## Quest 10 — Survive the Launch

The game becomes popular.

Traffic increases.

The player must:

- Scale the workload.
- Monitor resource health.
- Identify bottlenecks.
- Configure alerts.
- Improve resilience.

This introduces the transition from:

```text
"I can build Azure resources."
```

to:

```text
"I can operate an Azure environment."
```

---

# 16. Deployment Failures Are Gameplay

Deployments should not always succeed.

Failure is one of the main teaching mechanisms.

Example:

```text
Deploy Infrastructure
        ↓
Creating VNet                 ✓
Creating Subnet               ✓
Creating Storage              ✓
Creating Private Endpoint     ✗
        ↓
Deployment Failed
```

The player receives realistic information, but not necessarily the answer.

Example:

```text
ERROR

Private endpoint creation failed.

Reason:
The selected subnet is not suitable for
the requested configuration.

Hint available:
[ Show Hint ]

Documentation:
[ INFO ]
```

The player investigates and learns.

---

# 17. Failure Engine

The failure engine should eventually be able to generate realistic problems.

Initial MVP failure classes:

### Configuration failures

```text
Invalid address space
Incorrect subnet
Wrong SKU
Missing property
Invalid resource dependency
```

### Networking failures

```text
NSG blocks traffic
Missing route
Incorrect DNS
Private endpoint misconfiguration
Wrong port
```

### Identity failures

```text
Missing RBAC permission
Incorrect scope
Managed identity missing
Service principal authentication failure
```

### Application failures

```text
Container crashed
Bad image
Application unhealthy
Environment variable missing
```

### Pipeline failures

```text
YAML error
Wrong trigger
Build failure
Test failure
Deployment failure
Permission failure
```

Failures should be **intentionally designed as learning scenarios**, not random chaos.

---

# 18. Monitoring System

Monitoring should become a gameplay mechanic.

The simulator should generate:

- Metrics.
- Logs.
- Alerts.
- Application events.
- Deployment events.
- Resource state changes.
- Network events.

Players should learn this workflow:

```text
ALERT
  ↓
OBSERVE
  ↓
HYPOTHESIS
  ↓
INVESTIGATE
  ↓
ROOT CAUSE
  ↓
FIX
  ↓
VALIDATE
  ↓
MONITOR
```

This should eventually become one of the major pillars of the game.

---

# 19. Persistent Infrastructure — Later

For MVP:

**Infrastructure runs only while the game session is active.**

Example:

```text
Player online
     ↓
Simulation clock runs
     ↓
Traffic changes
     ↓
Metrics change
     ↓
Failures can occur
```

Later:

```text
Player leaves
      ↓
Infrastructure state saved
      ↓
Simulation continues server-side
      ↓
Player returns
      ↓
"Your database failed 2 hours ago."
```

Persistent server-side simulation is a later architectural evolution.

Do not build it into MVP.

---

# 20. Genuine DevOps Environment

The DevOps system should not be a fake checkbox.

The player should genuinely interact with:

## Repository

```text
/game-studio
│
├── application/
├── infrastructure/
│   ├── main.bicep
│   └── modules/
│
└── .github/
    └── workflows/
        └── deploy.yml
```

## Git

The simulator should support realistic concepts:

```bash
git status
git branch
git checkout
git add
git commit
git push
git pull
git diff
```

The game does not need to implement every Git command in MVP.

Implement the commands that support the learning experience.

---

# 21. Bicep Environment

Bicep should eventually become a first-class development environment.

Players should be able to write:

```bicep
resource storage 'Microsoft.Storage/storageAccounts@...' = {
    ...
}
```

The game should:

- Parse supported Bicep constructs.
- Validate supported properties.
- Identify dependency problems.
- Simulate deployment.
- Show resulting resources on the canvas.

The objective is not to implement all of Bicep.

The objective is to implement **enough authentic Bicep behavior to teach the real concepts**.

---

# 22. GitHub Actions Environment

GitHub Actions should be represented as actual workflows.

Example:

```yaml
name: Deploy Game API

on:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Validate
        run: ...

      - name: Test
        run: ...

      - name: Build
        run: ...

      - name: Deploy
        run: ...
```

The simulator should interpret supported workflow constructs and execute them in-game.

Pipeline visualization:

```text
┌──────────┐
│ Checkout │
└────┬─────┘
     ▼
┌──────────┐
│ Validate │
└────┬─────┘
     ▼
┌──────────┐
│  Tests   │
└────┬─────┘
     ▼
┌──────────┐
│  Build   │
└────┬─────┘
     ▼
┌──────────┐
│ Deploy   │
└────┬─────┘
     ▼
  Azure
```

The workflow should be able to fail.

---

# 23. Authentication in Pipelines

Eventually teach modern authentication rather than normalizing insecure secrets.

Topics should include:

```text
GitHub
   │
   │ OIDC
   ▼
Azure Identity
   │
   ▼
RBAC
   │
   ▼
Azure Resources
```

Also teach:

- Managed Identity.
- Service Principal.
- Federated Identity.
- OIDC.
- Permissions.
- Least privilege.

These concepts are explicitly relevant to the current AZ-400 objectives.

---

# 24. Player Workspace UI

The application should have a professional but game-like interface.

Recommended layout:

```text
┌──────────────────────────────────────────────────────────┐
│ Cloud Engineer Simulator    Level 4    PixelForge       │
├───────────────┬──────────────────────────┬───────────────┤
│               │                          │               │
│ QUEST         │                          │ RESOURCE      │
│               │      ARCHITECTURE        │ INSPECTOR     │
│ Ticket        │         CANVAS           │               │
│ Requirements  │                          │ Properties    │
│ Progress      │                          │ Health        │
│ Hints         │                          │ Security      │
│               │                          │ Dependencies  │
│               │                          │               │
├───────────────┴──────────────────────────┴───────────────┤
│ Terminal │ Logs │ Metrics │ Pipeline │ Git │ Events      │
└──────────────────────────────────────────────────────────┘
```

The architecture canvas should be the visual center of the application.

---

# 25. Resource Inspector

Clicking a resource should open an inspector.

Example:

```text
AZURE CONTAINER APP

Name:
game-api-prod

Status:
● Healthy

Environment:
game-prod

CPU:
34%

Memory:
48%

Replicas:
2 / 5

Ingress:
Enabled

Identity:
Managed Identity

Registry:
pixelforgeacr

[ INFO ]

[ CONFIGURE ]

[ VIEW LOGS ]

[ METRICS ]
```

The player should be able to understand the resource without needing to leave the application.

---

# 26. Visual Architecture Interaction

Users should be able to:

- Drag resources.
- Move groups.
- Zoom.
- Pan.
- Click resources.
- Inspect dependencies.
- Highlight connections.
- Show network boundaries.
- Show traffic paths.
- Show failed components.
- Filter resources.
- Toggle layers.

Potential layers:

```text
Infrastructure
Networking
Security
Traffic
Monitoring
Dependencies
Costs
Availability
```

Not all layers are required for MVP.

---

# 27. Architecture State vs Diagram Layout

Keep these conceptually separate.

A resource has:

```text
RESOURCE STATE

id
type
name
location
configuration
status
health
dependencies
permissions
metrics
logs
```

The visual representation separately has:

```text
VISUAL STATE

x
y
width
height
collapsed
group
display options
```

This allows the same infrastructure to exist independently of how the player chooses to arrange it visually.

---

# 28. Mission System

Missions should be data-driven.

Each mission should define:

```text
Mission
 ├── ID
 ├── Title
 ├── Client
 ├── Difficulty
 ├── Story
 ├── Requirements
 ├── Constraints
 ├── Objectives
 ├── Allowed Services
 ├── Expected Resources
 ├── Validation Rules
 ├── Failure Scenarios
 ├── Hints
 ├── Info Topics
 ├── Certification Tags
 ├── Rewards
 └── Completion Criteria
```

Example:

```json
{
  "id": "azure-foundations-001",
  "title": "PixelForge Goes to Azure",
  "difficulty": "beginner",
  "certifications": ["AZ-900"],
  "topics": [
    "resource-groups",
    "regions",
    "subscriptions",
    "tags"
  ]
}
```

This makes missions easy to add without changing the simulator engine.

---

# 29. Quest Design Philosophy

Each quest should feel like a **real client assignment**.

Instead of:

> "Create a VNet."

Use:

> "PixelForge needs its backend separated from public-facing workloads. Design a network that provides segmentation and room for future services."

The technical objective is hidden inside the business problem.

This teaches the player to translate:

```text
Business Requirement
        ↓
Technical Requirement
        ↓
Architecture
        ↓
Implementation
        ↓
Operations
```

That is much closer to real cloud engineering.

---

# 30. Hint System

Beginners must never feel lost.

Hints should be layered.

### Hint 1 — Direction

> "Look at the networking section."

### Hint 2 — Concept

> "The client wants network segmentation."

### Hint 3 — Resource

> "A VNet can provide the network boundary."

### Hint 4 — Action

> "Create a VNet with an address space of..."

The system should reward independent problem solving without punishing beginners.

---

# 31. Gamification

Gamification should reinforce learning.

Possible systems:

### XP

Earn XP for:

- Completing quests.
- Correct architecture.
- Troubleshooting.
- Secure solutions.
- Efficient pipelines.
- Incident resolution.

### Career level

```text
Level 1
Cloud Beginner

Level 5
Junior Cloud Engineer

Level 10
Cloud Engineer

Level 20
Senior Cloud Engineer

Level 30
Cloud Architect
```

### Badges

Examples:

```text
First Azure Deployment
Networking Foundations
Identity Guardian
Pipeline Builder
Incident Resolver
Zero Downtime
Cloud Architect
```

### Client reputation

A later system can track:

```text
Reliability
Security
Cost
Delivery
Client Satisfaction
```

---

# 32. Architecture Evaluation

Do not evaluate architectures only as:

```text
Correct / Incorrect
```

Eventually evaluate:

```text
Security
Reliability
Scalability
Performance
Cost
Maintainability
Observability
```

For example:

```text
ARCHITECTURE REVIEW

Security          92%
Reliability       78%
Scalability       84%
Cost              91%
Observability     63%
Maintainability   88%
```

The player should understand **why** the score was given.

---

# 33. MVP Technology Recommendation

Recommended initial stack:

```text
Frontend:
React
TypeScript
Vite

State:
Zustand

Architecture Canvas:
React Flow / XYFlow

Code Editor:
Monaco Editor

YAML:
js-yaml or equivalent parser

Storage:
IndexedDB / LocalStorage

Testing:
Vitest
Playwright

Hosting:
GitHub Pages

CI/CD:
GitHub Actions
```

The system should remain primarily client-side during MVP.

Do not introduce a backend unless a concrete requirement cannot reasonably be handled in the browser.

---

# 34. Suggested Repository Structure

```text
cloud-engineer-simulator/
│
├── .github/
│   └── workflows/
│       └── deploy.yml
│
├── public/
│   └── assets/
│
├── src/
│   │
│   ├── app/
│   │
│   ├── components/
│   │
│   ├── engine/
│   │   ├── simulation/
│   │   ├── resources/
│   │   ├── networking/
│   │   ├── monitoring/
│   │   ├── failures/
│   │   └── deployment/
│   │
│   ├── azure/
│   │   ├── resources/
│   │   ├── networking/
│   │   ├── identity/
│   │   └── services/
│   │
│   ├── missions/
│   │   ├── definitions/
│   │   ├── validators/
│   │   ├── hints/
│   │   └── content/
│   │
│   ├── devops/
│   │   ├── git/
│   │   ├── bicep/
│   │   ├── github-actions/
│   │   └── terminal/
│   │
│   ├── monitoring/
│   │
│   ├── ui/
│   │
│   └── state/
│
├── tests/
│
├── docs/
│   ├── architecture.md
│   ├── curriculum.md
│   └── missions.md
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

This structure should remain flexible. Do not prematurely create dozens of abstractions before they are needed.

---

# 35. MVP Resource Set

Do not attempt to simulate all Azure.

Start with a controlled set of resources.

Recommended initial set:

### Foundations

- Subscription
- Resource Group
- Region
- Tags
- Resource Locks

### Networking

- Virtual Network
- Subnet
- Network Security Group
- Public IP
- Route Table
- Private Endpoint
- Azure DNS

### Compute

- Virtual Machine
- App Service
- Container Registry
- Container App

### Storage

- Storage Account
- Blob Container
- Azure Files

### Identity

- Microsoft Entra User
- Service Principal
- Managed Identity
- RBAC Role Assignment

### Monitoring

- Azure Monitor
- Log Analytics Workspace
- Application Insights
- Alert
- Action Group

### DevOps

- Git Repository
- Branch
- Pull Request
- GitHub Actions Workflow
- Pipeline Job
- Build
- Deployment

This is enough to produce a meaningful first ecosystem.

---

# 36. What NOT to Build in MVP

Do not attempt:

- Real Azure deployment.
- AWS.
- GCP.
- Kubernetes deep simulation.
- Full Azure Portal reproduction.
- Complete Azure CLI.
- Complete Bicep compiler.
- Complete Git implementation.
- Complete GitHub Actions runner.
- Multiplayer.
- Cloud billing integration.
- Persistent server-side simulation.
- Massive open world.
- Every Azure service.
- Artificially complex 3D graphics.

The MVP must prove the **core gameplay loop**, not the entire final vision.

---

# 37. MVP Definition of Done

The MVP should be considered successful when a new player can open the GitHub Pages website and:

```text
Start Game
   ↓
Create/choose profile
   ↓
Enter first client project
   ↓
Receive a client quest
   ↓
Learn basic concepts through doing
   ↓
Build Azure architecture visually
   ↓
Configure resources
   ↓
Deploy simulated infrastructure
   ↓
See deployment progress
   ↓
Encounter realistic problems
   ↓
Use monitoring/logs/CLI to investigate
   ↓
Fix the issue
   ↓
Complete the client requirement
   ↓
Build a GitHub Actions pipeline
   ↓
Deploy through the simulated pipeline
   ↓
Monitor the running environment
   ↓
Advance to the next quest
```

If this works and is enjoyable, the MVP is successful.

---

# 38. MVP Success Criteria

The MVP should answer "yes" to these questions:

### Learning

Can a complete beginner understand what they are doing?

### Authenticity

Would someone familiar with Azure recognize the underlying concepts?

### Gameplay

Does building infrastructure feel like an activity rather than filling out a form?

### Visualization

Does the architecture become easier to understand because of the visual model?

### Simulation

Does infrastructure actually behave differently based on configuration?

### Troubleshooting

Can a player investigate a realistic problem instead of simply being told the answer?

### DevOps

Does the player actually interact with Git, YAML and pipelines?

### UX

Can a beginner navigate the interface without becoming overwhelmed?

### Replayability

Can new missions be added without rewriting the simulator engine?

---

# 39. MVP Architecture Diagram

```text
                         ┌──────────────────────────┐
                         │        React UI          │
                         │                          │
                         │ Portal / Canvas / Quest  │
                         │ Terminal / Inspector     │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │      Game State           │
                         │      / Zustand            │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │   Simulation Engine       │
                         │                          │
                         │ Resource State            │
                         │ Dependencies              │
                         │ Networking                │
                         │ Deployment                │
                         │ Failures                  │
                         │ Time                      │
                         │ Traffic                   │
                         └───────┬──────────┬───────┘
                                 │          │
                    ┌────────────┘          └─────────────┐
                    ▼                                     ▼
          ┌───────────────────┐                  ┌──────────────────┐
          │ Mission Engine    │                  │ DevOps Engine    │
          │                   │                  │                  │
          │ Quests            │                  │ Git              │
          │ Validation        │                  │ Bicep            │
          │ Hints             │                  │ GitHub Actions    │
          │ Certification     │                  │ Terminal          │
          └───────────────────┘                  └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Monitoring Engine│
                        │                  │
                        │ Metrics          │
                        │ Logs             │
                        │ Alerts           │
                        │ Incidents        │
                        └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ IndexedDB /      │
                        │ LocalStorage     │
                        └──────────────────┘
```

---

# 40. Development Strategy

Build the product **vertically**, not horizontally.

Do not spend months building a sophisticated canvas before the game is playable.

Instead, create one complete vertical slice:

```text
One Client
   ↓
One Quest
   ↓
A few Azure resources
   ↓
Visual Architecture
   ↓
Deployment
   ↓
Monitoring
   ↓
Failure
   ↓
Troubleshooting
   ↓
Completion
```

Then expand.

---

# 41. Recommended Development Phases

## Phase 1 — Foundation

Create:

- React application.
- GitHub repository.
- GitHub Pages deployment.
- Basic routing.
- Application shell.
- UI design system.
- State management.

Goal:

> The application is online and navigable.

---

## Phase 2 — Architecture Canvas

Implement:

- Nodes.
- Connections.
- Groups.
- Resource inspector.
- Zoom/pan.
- Resource statuses.

Goal:

> Users can build a visual cloud architecture.

---

## Phase 3 — Azure Resource Engine

Implement:

- Resource Groups.
- VNets.
- Subnets.
- NSGs.
- Storage.
- Compute.

Goal:

> Creating resources changes real simulation state.

---

## Phase 4 — First Quest

Implement the first complete client mission.

Goal:

> A beginner can complete one real cloud project.

---

## Phase 5 — Deployment Engine

Implement:

- Deployment operations.
- Dependencies.
- Deployment progress.
- Validation.
- Failures.

Goal:

> Infrastructure behaves like a deployable system.

---

## Phase 6 — Monitoring

Implement:

- Metrics.
- Logs.
- Alerts.
- Health states.
- Incident events.

Goal:

> The infrastructure continues behaving after deployment.

---

## Phase 7 — Incident Simulation

Implement:

- Application crashes.
- Networking problems.
- Identity failures.
- Deployment errors.

Goal:

> Players become responsible for operating infrastructure.

---

## Phase 8 — DevOps Environment

Implement:

- Git.
- Repository browser.
- YAML editor.
- GitHub Actions simulation.
- Bicep.
- Pipeline execution.

Goal:

> The player experiences a genuine mini DevOps workflow.

---

## Phase 9 — Progression

Implement:

- XP.
- Career levels.
- Quest unlocks.
- Badges.
- Certification mapping.

Goal:

> Players have a reason to continue.

---

# 42. Long-Term Vision

Eventually the product should evolve from:

```text
Cloud Learning Game
```

into:

```text
Cloud Engineering Simulation Platform
```

A mature player could receive:

> "You are now responsible for the Azure platform of a company with 20 applications, three environments and customers in Europe and North America."

They would need to:

```text
Design
Deploy
Secure
Automate
Monitor
Troubleshoot
Scale
Optimize
Document
Maintain
```

The infrastructure could evolve independently of the player's actions.

Eventually:

```text
                    CLIENT WORLD
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      Application      Users          Traffic
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  CLOUD INFRASTRUCTURE
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Healthy     Degraded     Failed
             │           │           │
             └───────────┼───────────┘
                         ▼
                    ENGINEER
                         │
                   Investigates
                         │
                      Fixes
                         │
                    Improves
```

---

# 43. End-Stage Real Azure Mode

Once the simulation is mature, introduce an optional real-cloud mode.

Potential experience:

```text
SIMULATION

Build:
Azure architecture

↓

Test:
Simulation

↓

Validate:
Mission

↓

Optional:

DEPLOY TO REAL AZURE

↓

Azure Sandbox Subscription

↓

Actual Resources
```

This should come much later.

The simulation should remain useful even without an Azure subscription.

---

# 44. The Ultimate Product Loop

The long-term vision is:

```text
        LEARN
          │
          ▼
        BUILD
          │
          ▼
       DEPLOY
          │
          ▼
        RUN
          │
          ▼
       MONITOR
          │
          ▼
       INCIDENT
          │
          ▼
      TROUBLESHOOT
          │
          ▼
         FIX
          │
          ▼
       IMPROVE
          │
          ▼
       ARCHITECT
          │
          └───────────────► harder client
```

This should remain the north star for every major feature.

---

# 45. Product North Star

The product should ultimately make a learner say:

> **"I forgot I was learning Azure. I was just trying to keep my client's infrastructure alive."**

That is the experience we are trying to build.

The simulator should teach the player the same fundamental cycle that real Cloud and DevOps engineers live through:

```text
Requirements
     ↓
Architecture
     ↓
Implementation
     ↓
Automation
     ↓
Deployment
     ↓
Operations
     ↓
Monitoring
     ↓
Incident Response
     ↓
Continuous Improvement
```

That is the foundation of the Cloud Engineer Simulator.

---

# 46. Instructions for the Development Agent

When building this project, prioritize the following:

1. **Build the simulation engine before adding large amounts of content.**

2. **Keep Azure concepts authentic.**
   When uncertain about Azure behavior, verify against current Microsoft documentation rather than inventing behavior.

3. **Never make the visualization a separate fake layer.**
   It must reflect actual simulated infrastructure state.

4. **Build one complete playable quest before adding dozens of resources.**

5. **Every feature should have a learning purpose.**

6. **Every mission should teach through hands-on work.**

7. **Beginners must always have a path forward.**
   Hints, highlighting and INFO explanations should prevent frustration.

8. **Do not overwhelm beginners with expert terminology.**
   Reveal complexity progressively.

9. **Failure should teach.**
   Every intentional failure should have an understandable root cause and investigation path.

10. **Do not implement unnecessary infrastructure.**
    Keep the simulation small until a gameplay requirement justifies expansion.

11. **Keep content data-driven.**
    New quests should primarily be created through mission definitions rather than changes to engine code.

12. **Separate generic simulation logic from Azure-specific resource definitions.**
    Azure is the only provider in MVP, but avoid making the engine impossible to extend later.

13. **Treat UX as a core feature.**
    The product should feel comfortable, clear and polished even when teaching difficult concepts.

14. **Don't chase visual complexity for its own sake.**
    Clarity of architecture is more important than impressive graphics.

15. **The player should always understand:**
    - What am I doing?
    - Why am I doing it?
    - What does this resource do?
    - What depends on it?
    - What can go wrong?
    - How do I know it is working?

16. **The MVP must remain fully playable on GitHub Pages.**
    Do not introduce backend dependencies unless explicitly approved.

17. **Use current certification objectives as curriculum metadata, not as the entire curriculum.**
    Microsoft changes exam objectives, so the mapping must be versioned and maintainable.

---

# 47. First Implementation Target

The first meaningful milestone should be:

> **"A beginner can open the website, receive a PixelForge Games client ticket, create a Resource Group, build a small Azure architecture on the visual canvas, deploy it, observe it running, intentionally encounter a deployment/operational problem, investigate the issue, fix it, and complete the quest."**

Everything in the initial development should work toward this.

Do not build the entire Cloud Engineer career first.

**Build the first believable day in the life of a Cloud Engineer.**
