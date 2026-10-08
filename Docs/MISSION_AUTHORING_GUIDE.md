# Mission Authoring Guide

Use this guide whenever creating a new Cloud Engineer Simulator quest.

## Goal

Every mission should feel like real client work while still being structured enough to teach a specific set of cloud skills.

---

## 1. Start with the client

Define:

```text
Client
Industry
Size
Current situation
Business goal
Technical pain
Constraints
```

Example:

```text
Client: PixelForge Games
Industry: Game development
Size: Small
Goal: Launch online multiplayer backend
Pain: No reliable cloud platform
Constraints: Small budget, small engineering team
```

---

## 2. Write the ticket

The ticket should sound like a real work request.

Example:

> We are preparing the backend for our multiplayer game launch. We need a secure Azure environment that can host the API, store game assets, and provide basic monitoring.

Do not tell the player every implementation detail.

---

## 3. Define acceptance criteria

Write objective success conditions.

Example:

```text
[ ] Resources are deployed to the correct resource group
[ ] Application is reachable
[ ] Database has no public exposure
[ ] Required identity permissions are configured
[ ] Monitoring is enabled
[ ] Pipeline can deploy the application
```

---

## 4. Define learning objectives

Map technical objectives to real concepts.

Example:

```text
VNet → network isolation
Subnet → segmentation
NSG → traffic control
Managed Identity → credentialless service authentication
RBAC → authorization
GitHub Actions → CI/CD
```

---

## 5. Define the intended architecture

Document the preferred baseline architecture, but allow alternative valid designs when reasonable.

Example:

```text
Internet
   ↓
Application Gateway
   ↓
Container App
   ↓
Private Endpoint
   ↓
Database
```

---

## 6. Define possible failures

Choose failures that reinforce the concepts being learned.

For example:

```text
Failure:
NSG blocks HTTPS

Symptom:
Requests fail

Evidence:
Network logs + application error

Root cause:
Incorrect inbound rule

Fix:
Allow HTTPS from expected source

Validation:
Requests succeed
```

---

## 7. Define hint levels

```text
Hint 1:
Think about the network.

Hint 2:
The workload is reachable only over HTTPS.

Hint 3:
Check the NSG attached to the subnet.

Hint 4:
Inspect inbound rules.

Hint 5:
A rule is preventing TCP/443.
```

---

## 8. Define INFO content

Every unfamiliar resource should have an INFO entry.

Keep it short.

Example:

### VNet

**What is it?**  
A private network boundary in Azure.

**Why do we use it?**  
To control how workloads communicate.

**Think of it like:**  
The network segment of a datacenter.

**Related:**  
Subnets, NSGs, routing, private endpoints, peering.

---

## 9. Define monitoring behavior

Specify which signals should change when something happens.

```text
Incident
 ↓
Metric change
 ↓
Log event
 ↓
Alert condition
 ↓
Player notification
```

---

## 10. Define the validation model

Validation should check actual simulated state, not whether the user clicked a button.

Example:

```text
resource.exists("vnet")
resource.subnet.exists("api-subnet")
resource.nsg.allows("tcp", 443)
resource.api.health == "healthy"
pipeline.lastRun.status == "success"
```

---

## 11. Define certification metadata

Tag concepts covered by:

- AZ-900
- AZ-104
- AZ-700
- AZ-400

Use these tags for learning analytics, filters, progression, and future certification preparation.

Do not treat certification tags as an automatic pass/fail exam simulator.

---

## 12. Mission completion

A mission should end with a clear client outcome.

Example:

> "The multiplayer backend is now running in Azure, the deployment pipeline is operational, and monitoring is detecting application health issues."

The player should feel that they delivered something of value.
