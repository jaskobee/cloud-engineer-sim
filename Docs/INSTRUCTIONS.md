# Cloud Engineer Simulator — Development Instructions

## 1. Mission

Build a **fully playable web-based Cloud Engineer / Cloud Architect simulator** that teaches real Azure concepts through hands-on simulation.

This is a learning product first and a game second.

The game should feel fun, but technical accuracy and transferable knowledge are more important than novelty.

---

## 2. Non-negotiable principles

### Authentic Azure

Use real Azure terminology and recognizable Azure behavior.

When a behavior is uncertain, verify it from current Microsoft documentation rather than inventing an answer.

Do not invent fake Azure resources when a real Azure concept exists.

### One source of truth

The simulator has one authoritative infrastructure state.

All interfaces operate against that state:

- Canvas
- Resource inspector
- Portal-like UI
- CLI
- Bicep
- Git
- GitHub Actions
- Monitoring
- Logs
- Alerts
- Mission validators
- Failure engine

Never maintain multiple disconnected representations of the same infrastructure.

### Browser-first MVP

The MVP must run on GitHub Pages without a backend.

Do not introduce server-side infrastructure unless a concrete requirement cannot be solved client-side.

### Real Azure is later

Do not couple the MVP to a live Azure subscription.

Design abstractions so a future Azure adapter could map simulated resources to real Azure resources.

---

## 3. The agent must preserve project scope

Before adding a feature, ask:

1. Does the feature improve the player's learning?
2. Does it strengthen the simulation?
3. Is it required for the MVP?
4. Can it be implemented simply?
5. Does it create unnecessary coupling?
6. Does it block future evolution?

Prefer the smallest implementation that proves the gameplay value.

---

## 4. Build vertically

Prefer this:

```text
One resource
 ↓
One mission
 ↓
One deployment
 ↓
One failure
 ↓
One monitoring scenario
 ↓
One troubleshooting flow
```

over building huge isolated systems with no playable loop.

The first milestone is a complete playable quest.

---

## 5. Never fake the core learning

Do not implement features that only look correct visually.

Example of a bad approach:

```text
Click "Deploy"
 ↓
Animation
 ↓
Green checkmark
```

Preferred:

```text
Click "Deploy"
 ↓
Validate configuration
 ↓
Resolve dependencies
 ↓
Create resources
 ↓
Simulate provisioning
 ↓
Potential failure
 ↓
Update infrastructure state
 ↓
Update monitoring
 ↓
Update quest state
```

The result must be explainable.

---

## 6. Learning by doing

The default experience should be hands-on.

Do not explain a concept for ten paragraphs before letting the player act.

Use:

```text
Brief Context
 ↓
Action
 ↓
Feedback
 ↓
Info / Hint when needed
 ↓
Continue
```

The player can always open an `INFO` explanation for difficult concepts.

---

## 7. Assistance modes

Support at least:

### Guided

For complete beginners:
- Highlight controls.
- Point to relevant resources.
- Explain what to do next.
- Provide layered hints.
- Explain why the action matters.

### Standard

For growing engineers:
- Provide requirements.
- Offer optional hints.
- Expect independent investigation.

### Expert

For advanced users:
- Provide client requirements and constraints.
- Minimize hints.
- Evaluate the architecture and operational decisions.

Users can switch modes as they improve.

---

## 8. Do not overwhelm beginners

New users should not encounter a wall of Azure terminology.

Reveal complexity progressively.

For example:

```text
Beginner:
VNet = your private network in Azure

Later:
Address Spaces
Subnets
NSGs
UDRs
Private Endpoints
DNS
Peering
VPN
Routing
```

The concept can remain authentic while the explanation evolves.

---

## 9. Missions are client work

Missions must feel like tickets, projects, or client assignments.

Avoid purely academic objectives such as:

> "Create an NSG."

Prefer:

> "The client needs the game API separated from public traffic while allowing HTTPS access."

The player should translate:

```text
Business Requirement
        ↓
Technical Requirement
        ↓
Architecture
        ↓
Implementation
        ↓
Validation
```

---

## 10. Every deployed resource should teach something

When the player creates or deploys a meaningful resource, provide a short explanation.

A useful explanation includes:

- What is this?
- Why does the client need it?
- What does it connect to?
- What could go wrong?

The player should be able to continue without reading the explanation, while curious learners can explore deeper.

---

## 11. Failure is a feature

Failures should be intentional teaching mechanisms.

Examples:

- Incorrect subnet
- Overlapping address ranges
- NSG blocking traffic
- Missing RBAC permission
- Managed identity missing a role
- Container image not found
- Application unhealthy
- Invalid pipeline YAML
- Deployment dependency failure
- DNS misconfiguration

Every deliberate failure needs:

```text
Observable symptom
        ↓
Evidence
        ↓
Likely causes
        ↓
Investigation path
        ↓
Root cause
        ↓
Correct fix
        ↓
Validation
```

Do not make failures arbitrary.

---

## 12. Monitoring should be causal

Metrics, logs and alerts must reflect simulated infrastructure state.

For example:

```text
NSG blocks port 443
       ↓
Requests fail
       ↓
Application errors increase
       ↓
Availability decreases
       ↓
Alert fires
```

Do not generate unrelated numbers simply to make dashboards look realistic.

---

## 13. Architecture visualization

The canvas is not decoration.

It is a debugging and learning interface.

It should help the user answer:

- What exists?
- Where does it live?
- What talks to what?
- What depends on what?
- What is unhealthy?
- Where is the network boundary?
- What changed?

When possible, make relationships visible.

---

## 14. Explain decisions, not just actions

Avoid:

> "Create a Private Endpoint."

Prefer:

> "The database should not be reachable through a public endpoint. A Private Endpoint provides private connectivity into the service."

Then let the player make the change.

---

## 15. Azure service abstraction

Keep generic simulation mechanics separate from Azure-specific definitions.

Conceptually:

```text
Simulation Engine
      │
      ▼
Generic Resource Model
      │
      ▼
Azure Resource Adapter
      │
      ├── VNet
      ├── Subnet
      ├── NSG
      ├── Storage Account
      ├── VM
      ├── Container App
      └── ...
```

This makes later provider expansion possible without making MVP multi-cloud.

---

## 16. Mission content must be data-driven

Mission definitions should be stored as data.

A mission should define:

- Story
- Client
- Difficulty
- Requirements
- Objectives
- Constraints
- Supported services
- Expected infrastructure
- Validation rules
- Failure scenarios
- Hints
- Info topics
- Certification tags
- Rewards

Engine code should not need to change for every new quest.

---

## 17. DevOps authenticity

The DevOps experience should be a genuine mini environment.

Prioritize:

- Git concepts
- Branches
- Commits
- Pull Requests
- YAML
- Workflow execution
- Build
- Test
- Deploy
- Bicep
- Pipeline failures
- Authentication
- Monitoring

The simulator does not need to implement the entire Git/GitHub product.

Implement the subset that provides real learning value.

---

## 18. Security

Never encourage insecure patterns purely for convenience.

Teach:

- Least privilege
- RBAC
- Managed Identity
- Service Principals
- OIDC
- Secret management
- Private connectivity
- Secure defaults

Never require real credentials for MVP gameplay.

---

## 19. UX priorities

The application should feel:

- Calm
- Clear
- Modern
- Professional
- Slightly game-like
- Consistent
- Responsive
- Easy to navigate

Do not sacrifice usability to make the application look "more technical."

---

## 20. Code quality

Prefer:

- TypeScript
- Small, cohesive modules
- Explicit data models
- Strong typing
- Testable simulation logic
- Deterministic simulation where possible
- Clear naming
- Minimal global state
- Reusable components
- Documentation for non-obvious engine behavior

Avoid premature abstractions.

---

## 21. Testing

Test the simulation engine more heavily than visual components.

At minimum, cover:

- Resource creation
- Resource deletion
- Dependency resolution
- Network rules
- State transitions
- Deployment success
- Deployment failure
- Health changes
- Monitoring events
- Mission validation
- Pipeline success/failure
- Save/load state

A visible UI bug is annoying.

A simulation-state bug can invalidate the learning experience.

---

## 22. When adding an Azure service

Use this process:

```text
Why is it needed?
      ↓
What real Azure concept does it represent?
      ↓
What dependencies does it have?
      ↓
What configuration matters for learning?
      ↓
What can realistically fail?
      ↓
What telemetry should it produce?
      ↓
How does it affect the architecture graph?
      ↓
Which missions use it?
```

Do not add services simply because Azure has them.

---

## 23. MVP discipline

Do not expand the MVP into:

- Multi-cloud
- Real Azure deployment
- Multiplayer
- Persistent server-side simulation
- Full Azure Portal clone
- Full Bicep compiler
- Full Git implementation
- Full GitHub Actions runner
- Complete Azure CLI

These are future possibilities, not MVP requirements.

---

## 24. Definition of success

The MVP succeeds if a beginner can:

```text
Start
 ↓
Receive a client ticket
 ↓
Build a small Azure architecture
 ↓
Deploy it
 ↓
See it operating
 ↓
Encounter a realistic issue
 ↓
Investigate using built-in tools
 ↓
Fix it
 ↓
Understand why it broke
 ↓
Complete the client project
```

That experience is more important than the number of Azure services implemented.

---

## 25. Product north star

Always optimize for:

> "Make the player feel like a Cloud Engineer."

Not:

> "Make a realistic cloud diagram."

The visual architecture is the foundation of the experience, but the player needs to **own the infrastructure**:

Build it.

Operate it.

Break it.

Fix it.

Improve it.
