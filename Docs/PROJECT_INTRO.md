# Cloud Engineer Simulator — Project Introduction

## What is this project?

**Cloud Engineer Simulator** is a browser-based learning game designed to teach Cloud Engineering, DevOps, and eventually Cloud Architecture through realistic hands-on simulation.

The player should feel like they have joined a real company as a Cloud Engineer and are responsible for client infrastructure.

The core idea is:

> Learn Cloud by building it, deploying it, operating it, breaking it, troubleshooting it, and improving it.

This project is a separate product from **Network Engineer Simulator (NetSim)**. Both projects share the same philosophy of learning through simulation, missions, realistic engineering workflows, and strong visualization, but they are technically independent.

---

## The player fantasy

The player is not taking a normal course.

They are working as an engineer.

A typical progression looks like:

```text
Client Request
      ↓
Understand Requirements
      ↓
Design Architecture
      ↓
Build Infrastructure
      ↓
Configure Services
      ↓
Deploy
      ↓
Validate
      ↓
Go Live
      ↓
Monitor
      ↓
Incident
      ↓
Troubleshoot
      ↓
Fix
      ↓
Improve
      ↓
Larger Client
```

The game should eventually make the player think:

> "I forgot I was learning Azure. I was just trying to keep my client's infrastructure alive."

---

## MVP scope

### Cloud provider

Microsoft Azure only.

The Azure simulation must use authentic Azure terminology, concepts, dependencies, and realistic behavior.

### Hosting

The MVP must be fully playable as a static web application hosted on **GitHub Pages**.

### Real Azure

Real Azure deployment is a future/end-stage feature.

The MVP uses a browser-side simulation engine that models Azure concepts without provisioning real resources.

### Simulation time

For MVP, the infrastructure runs while the player is actively playing.

Persistent server-side simulation is a future feature.

---

## Core experience

The MVP should combine:

- Interactive architecture visualization
- Simplified Azure Portal-like UI
- Azure-style resource configuration
- Terminal / Azure CLI-inspired interaction
- Bicep editing
- Git and repository concepts
- GitHub Actions workflow simulation
- Monitoring
- Logs
- Alerts
- Deployment failures
- Infrastructure failures
- Troubleshooting
- Quests and client projects
- Progression and career levels
- Contextual learning
- Hints and guided assistance

The player can approach the same problem through multiple interfaces as their skill grows.

```text
             Same Infrastructure State
                       │
      ┌────────────────┼────────────────┐
      │                │                │
    Portal           CLI              Bicep
      │                │                │
      └────────────────┼────────────────┘
                       │
                DevOps Pipeline
                       │
                 Monitoring
```

---

## The most important technical principle

The visual architecture must never be a disconnected drawing layer.

There is one underlying simulated infrastructure state.

For example:

```text
VNet
 ├── Subnet
 │    └── Container App
 └── Private Subnet
      └── Database
```

If the player changes an NSG rule, the same infrastructure state must be visible through:

- Architecture canvas
- Resource inspector
- CLI
- Monitoring
- Logs
- Deployment state
- Mission validation

That single state model is the foundation of the simulator.

---

## Learning philosophy

The product is **hands-on first**.

Teach concepts when the player needs them.

Preferred loop:

```text
Need
 ↓
Action
 ↓
Problem
 ↓
Investigation
 ↓
Explanation
 ↓
Solution
 ↓
Understanding
```

Do not turn the game into a textbook.

Every complex concept should have an `INFO` experience that gives:

- What it is
- Why it exists
- How it works
- Why the current client needs it
- Common mistakes
- Related concepts
- Certification relevance

Beginners receive more guidance.

Advanced users receive less guidance and more autonomy.

---

## Initial learning path

The curriculum should grow around real Microsoft Azure skills and certification domains, including:

- AZ-900
- AZ-104
- AZ-700
- AZ-400

A future architecture track can expand toward AZ-305-level design concepts.

Certification objectives should be treated as **curriculum metadata and coverage targets**, not as the entire game design.

---

## First client

The first campaign centers on a fictional small game studio:

**PixelForge Games**

The client is preparing an online multiplayer game and needs a cloud platform for its backend.

This first campaign should gradually introduce:

- Azure foundations
- Resource groups
- Networking
- Compute
- Storage
- Containers
- Identity
- RBAC
- Managed identity
- Monitoring
- Logging
- Bicep
- Git
- GitHub Actions
- CI/CD
- Deployment
- Troubleshooting
- Basic scalability and reliability

---

## Product architecture

Conceptually:

```text
                    React Application
                           │
                    Game State / Store
                           │
                    Simulation Engine
                           │
     ┌─────────────┬───────┼────────┬─────────────┐
     │             │       │        │             │
  Resources    Networking  Time   Failures    Deployments
     │             │                │             │
     └─────────────┴────────────────┴─────────────┘
                           │
                    Monitoring Engine
                           │
                    Mission Engine
                           │
                    DevOps Engine
                           │
          ┌────────────────┼────────────────┐
          │                │                │
         Git             Bicep        GitHub Actions
          │                │                │
          └────────────────┴────────────────┘
                           │
                    Visual Interface
```

---

## Long-term vision

The long-term vision is not simply a Cloudcraft-style diagramming tool.

It is a **simulation-based learning platform for infrastructure engineers**.

Future products could eventually include:

```text
NetSim
Cloud Engineer Simulator
DevOps Simulator
Kubernetes Simulator
Security Engineer Simulator
Platform Engineer Simulator
```

Keep today's architecture focused enough to ship, while avoiding choices that make this future impossible.

---

## North Star

Build a world in which cloud infrastructure feels:

- visual
- interactive
- stateful
- understandable
- realistic
- risky
- operational
- rewarding to master

The player should learn the same engineering cycle that real Cloud and DevOps engineers live through:

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
