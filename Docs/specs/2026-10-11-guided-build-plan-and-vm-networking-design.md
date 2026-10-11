# Guided build plan and portal-accurate VM networking: design (2026-10-11)

Status: **approved by Jasko on 2026-10-11, implemented (D-8)**. Plan style chosen in chat: **Exact recipe**. Plan: `Docs/plans/2026-10-11-guided-build-plan-and-vm-networking.md`.

Deviations while building: the spec's step 1 ("look around") became the plan's intro plus a derived "Already in the subscription" list; monitoring is two steps (resources, then test + alert), so the plan has 12 steps; the NSG-rule steps count rules (reachability stays with the objectives, rule 5); rule priorities follow the objectives' hints (HTTPS 200, SSH 210); Standard mode's hints don't point at plan steps.

## 1. Why

Jasko's playtest of the portal UI (D-7):

> "it's a little confusing how to start with the first task, for the guided selection we need to tell the user WHAT to
> create and how, currently it is not clear if the resource are created or already exist. Also if we have to create the
> VM, what kind of options do we take? Why is the NIC not possible to be created in the VM section? We should keep it
> accurate with the real azure portal creation."

Three problems:
1. **Guided doesn't say what to build.** Objectives are acceptance criteria ("Players reach the game API over HTTPS").
   A beginner needs the build order and the values.
2. **Existing vs new is unclear.** Mia's test resource group is already there, and nothing says who made it.
3. **The VM wizard isn't the portal's.** In the portal, Create a virtual machine makes the network interface (and a
   public IP) on its Networking tab. The sim asks you to make a NIC first and attach it. That teaches the wrong workflow.

**Success criteria**
1. A Guided player can build the whole first stage from the ticket alone: every step says what to create, where in the
   portal, with which values and why.
2. A player can tell for every resource who created it, and the game teaches where to find that out (Activity log).
3. Creating a VM works like the portal: Basics, Disks, Networking (Virtual network, Subnet, Public IP, NIC network
   security group), Review + create. One deployment creates the public IP, the NIC, the OS disk and the VM.
4. Checks stay relationship-based (CLAUDE.md rule 10). The recipe's names and values are suggestions; any valid design
   still passes.

## 2. Research basis (Microsoft Learn)

| Page | Updated | What it gives |
|---|---|---|
| [Create a VM with a static public IP (portal)](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/virtual-network-static-public-ip) | 2026-02-25 | Basics: "Public inbound ports: Select **None**" ("All public inbound ports are closed for this virtual machine"). Networking › **Network interface**: Virtual network, Subnet, Public IP: "Select **Create new**. In **Create public IP address**, enter *myPublicIP* in **Name**. **SKU**: select **Standard**. **Assignment**: select **Static**. Select **OK**." |
| [Quickstart: create a virtual network (portal)](https://learn.microsoft.com/en-us/azure/virtual-network/quick-create-portal) | 2026-03-27 | Networking: "Public IP: Select **None**"; "NIC network security group: Select **Advanced**"; "Configure network security group: Select **Create new**" |
| [Tutorial: filter network traffic with an NSG](https://learn.microsoft.com/en-us/azure/virtual-network/tutorial-filter-network-traffic) (L-NSGTUT) | 2026-02-02 | Basics: Inbound port rules › "Select inbound ports: **None**". Networking: "Public IP: Leave the default of a new public IP"; "NIC network security group: Select **None**" |
| [Virtual networks and virtual machines](https://learn.microsoft.com/en-us/azure/virtual-machines/network-overview) (L-VMNET) | | "When you create a VM in the Azure portal, a network interface is automatically created for you" (NIC-3) |
| [Create a public IP address (portal)](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/create-public-ip-portal) (L-PIPPORTAL) | 2025-11-18 | Standard SKU, IP address assignment: "Only option is **Static**" |
| [Define the order for deploying resources](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/resource-dependency) (L-DEPEND) | | ARM-8: Resource Manager deploys resources in dependency order, independent ones in parallel |
| [Deployment history](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deployment-history) (L-DEPHIST) | | ARM-10: a deployment can include multiple operations; PORTAL-9: **Operation details** shows each step |

**Settled by this research**
- PIP-5u (QA finding M2): a Standard public IP is Static (L-PIPPORTAL, and the VM wizard's **Assignment: Static**).
  L-VMNET's "By default, public IP addresses are dynamic" is older text about Basic. PIP-5u becomes **PIP-5, VERIFIED**.

**Not verified, so not modelled** (no Learn source, no label)
- The NIC network security group option **Basic** (and the rules it would create), and the rules **Allow selected ports**
  creates (NIC-5 stays UNCERTAIN: the pages disagree).
- The portal's default names for the new NIC and public IP. Learn's examples type a name (*myPublicIP*).
- "Delete public IP and NIC when VM is deleted": VM delete isn't modelled yet.

## 3. Design

### 3.1 The VM wizard becomes the portal's (PORTAL-19, PORTAL-20, PORTAL-20s)

**Basics** (unchanged, plus one section)
- Project details, Instance details (name, region, image Ubuntu 22.04, size), Administrator account (SSH public key,
  username).
- New section **Inbound port rules** › **Public inbound ports**: **None**, shown fixed. A Simulator note says why:
  "Allow selected ports isn't modelled: the rules it would create aren't documented consistently. Control inbound traffic
  with network security groups." That's also the mission's design (subnet NSGs).

**Disks**: unchanged (OS disk type).

**Networking** › section **Network interface**
| Field | Options | Default |
|---|---|---|
| Virtual network | VNets in the VM's region and subscription (VNET-6) | first one |
| Subnet | that VNet's subnets, shown as `name (prefix)` like Learn | first one |
| Public IP | **(new) `<vm>-ip`** · **Create new** (pane: Name, SKU Standard fixed, Assignment Static fixed, **OK**) · **None** | a new public IP (L-NSGTUT) |
| NIC network security group | **None**, fixed. Simulator note: "Advanced isn't modelled here yet. You can associate an NSG with the network interface after it's created." | None |
| Network interface name | Simulator field, read-only: `<vm>-nic` | |

The "attach an existing NIC" select goes away. Standalone NICs can still be created under Network interfaces
(PORTAL-7 lists that create page), and the engine still accepts `networkInterfaceId` (tests, templates, mission data).

**Review + create** lists the VM settings plus "Network interface (new)", "Public IP (new) / None", "Subnet".
Validation dry-runs the whole deployment, so errors (subnet full, name taken, wrong region) appear before **Create**.

**Create** submits one deployment (§3.2). The deployment page lists every operation with its state; **Go to resource**
opens the VM. On the VM's **Networking** page the new NIC and public IP are linked.

### 3.2 Engine: a portal deployment with several operations (ARM-15s)

A new command `arm/deployments/write` (payload: subscription, resource group, deployment name, ordered list of resource
writes). It's what the portal does when one create page makes several resources.

- **Validation**: each write is validated in order against the world with the earlier ones applied. A write may reference
  a resource created earlier in the same deployment (that's its dependency; ARM-11u only refuses references to *other*
  in-progress deployments). The first refusal refuses the whole deployment, with its rule.
- **Running**: all resources show `Creating` from submission (SIM). Operations run in dependency order (ARM-8): the
  public IP, then the NIC, then the VM with its OS disk. Each operation records its own `Started` and `Succeeded` in the
  activity log with the deployment's correlation ID. Durations stay ARM-13s (6 s + 6 s + 90 s).
- **Data**: `Deployment.operation` becomes `operations: DeploymentOperation[]` (each with `startsAt`/`endsAt`). Single
  writes are a one-operation list (ARM-12s unchanged). Save files from before the change are migrated on load.
- **Name**: `<vm name>-<YYYYMMDDHHmmss>` (ARM-12s rule extended).
- Determinism, the tick-boundary completion and the history limit (ARM-10) are unchanged.

The VM handler itself doesn't change: the wizard sends PIP write → NIC write (with `publicIPAddressId`) → VM write (with
`networkInterfaceId`). So every Azure rule stays in one place.

### 3.3 Guided build plan in the ticket (exact recipe)

`MissionDef.buildPlan?: BuildStep[]`, mission data:

```ts
interface BuildStep {
  id: string
  title: string                     // "Create the production resource group"
  intro: string                     // one or two sentences: what and why
  settings: { label: string; value: string; why: string; rules: string[] }[]
  portalPath: PathStep[]            // as today: highlights the next control
  done: (world: World) => boolean   // derived by relationships, never by name
}
```

**Where it shows**
- **Guided**: the ticket's first tab during the build stage is **Build plan**: numbered steps, the current one expanded
  (settings table with a "why" per row, the portal path with **Show me**), done steps ticked and collapsed. The objectives
  move below it as "What the client checks".
- **Standard**: no plan. Objectives and hints as today; the last hint of each objective points at the matching plan step.
- **Expert**: neither.

**Recipe for mission 1** (values are suggestions; the checks accept any valid design)

| # | Step | Values (why) | Done when |
|---|---|---|---|
| 1 | Look around first | Mia's `rg-pixelforge-test` (North Europe) already exists, with a test VNet. Leave it alone: it's not part of this job. **Created by** shows who made it | the player opened Resource groups |
| 2 | Resource group | `rg-pixelforge-prod`, West Europe (players are in the EU; VNET-1) | a resource group in West Europe created by the player |
| 3 | Virtual network | `vnet-pixelforge-prod`, `10.40.0.0/16` (private range, VNET-2; room for more subnets; doesn't overlap Mia's 10.50.0.0/16) | a VNet in West Europe |
| 4 | Subnets | `snet-game` `10.40.1.0/24`, `snet-data` `10.40.2.0/24` (one subnet per tier so each gets its own NSG; SUB-2: 251 usable addresses) | that VNet has two subnets |
| 5 | NSGs | `nsg-snet-game`, `nsg-snet-data`, West Europe | two NSGs in West Europe |
| 6 | Game rules | `Allow-HTTPS`: Inbound, Allow, TCP, source Service Tag Internet, port 443, priority 100 (players; PIP-1). `Allow-SSH-Office`: source 203.0.113.10, port 22, priority 110 (admin only from the office; NSG-1) | the evaluator allows 443 from the internet and 22 from the office on an NSG in front of the game subnet |
| 7 | Data rules | `Allow-Postgres-From-Game`: source 10.40.1.0/24, port 5432, priority 100. `Deny-VNet-Inbound`: Deny, source VirtualNetwork, any port, priority 200 (AllowVNetInBound 65000 would let everything in; NSG-3) | 5432 allowed from the game subnet only |
| 8 | Associate | each NSG with its subnet (Subnets › Associate) (subnet NSGs protect every VM in the subnet; NSG-7) | both subnets have an NSG |
| 9 | Game VM | `vm-game-01`, Ubuntu 22.04, `Standard_B2s_v2` (burstable: cheap for a beta with spiky load; VM-13), Standard SSD (VM-10), username `pixelops` (VM-2), Public inbound ports None (the subnet NSG controls access), Networking: snet-game, Public IP **new** (players need it; PIP-10s), NIC NSG None | a VM with a public IP in a subnet with an NSG |
| 10 | Database VM | `vm-db-01`, same size, snet-data, Public IP **None** (never public) | a second VM, no public IP |
| 11 | Install the apps | game API on the game VM, PostgreSQL on the database VM, pointed at its private IP (Simulated app section) | both apps installed |
| 12 | Monitoring | Log Analytics workspace, Application Insights, standard test `https://<game public IP>/health` from 5 locations (MON-2), alert rule at 3 of 5 failed locations | the monitoring objective passes |

The incident and fix stages keep their objective paths; the plan covers the build.

### 3.4 Existing vs new: **Created by** (PORTAL-21s)

Lists and Essentials get a **Created by** value, marked as a Simulator field. It's derived (rule 6): the caller of the
first `Succeeded` write to that resource in the activity log, shown as a name ("Mia Becker", "You"). An INFO line
explains: in the real portal you find this in the resource's **Activity log** (PORTAL-10). Resources whose history has no
create event show "Unknown (before the activity log)".

## 4. Register changes

New sources
- **L-VMSTATICPIP**: Create a VM with a static public IP address (portal), updated 2026-02-25.
- **L-VNETQS**: Quickstart: create a virtual network (portal), updated 2026-03-27.

Rules
- **PORTAL-19**: VM create Basics › **Inbound port rules** › **Public inbound ports**: **None** ("All public inbound ports
  are closed for this virtual machine") or Allow selected ports (VM-4). L-VMSTATICPIP, L-VNETQS, L-NSGTUT, L-VMQS. VERIFIED.
- **PORTAL-20**: VM create **Networking** › **Network interface**: Virtual network, Subnet, Public IP (default a new public
  IP; **Create new** → Create public IP address: Name, SKU Standard, Assignment Static, **OK**; or **None**), NIC network
  security group (**None**; **Advanced** → Configure network security group → **Create new**). L-VMSTATICPIP, L-VNETQS,
  L-NSGTUT. VERIFIED.
- **PORTAL-20s**: Sim: Public inbound ports and NIC network security group offer only **None**; default names `<vm>-ip`
  and `<vm>-nic` are made up. SIM.
- **PORTAL-21s**: Sim: **Created by**, derived from the activity log. SIM.
- **ARM-15s**: Sim: a create page that makes several resources submits one deployment with one operation per resource,
  run in dependency order (ARM-8), all shown Creating from submission. SIM.
- **PIP-5** (was PIP-5u): Standard public IPs are Static only. L-PIPPORTAL, L-VMSTATICPIP. VERIFIED.
- Updated: PORTAL-7s (the "attach a NIC you created first" sentence goes), VM-16s (new or existing NIC), ARM-12s (refers
  to ARM-15s).

## 5. Testing

- Engine: multi-operation deployment (validation in order, in-deployment references allowed, refusal refuses all,
  operation order and activity log events, save migration), with rule IDs asserted.
- `buildCommands('virtualMachine', …)`: PIP + NIC + VM, and NIC + VM with Public IP None.
- Mission: `tests/missions/play.ts` gets a portal-style build (VM wizard deployment) next to the existing NIC-first
  build; both finish the mission. Each build step's `done` turns true in order on the intended build, and on the
  alternative design.
- `paths.test.ts`: build plan paths resolve and cite PORTAL rules; every `settings[].rules` ID exists.
- e2e: Guided start shows the build plan; the VM wizard creates a VM with a new NIC and public IP.
- azure-qa agent on the changed register rows and player-facing text.

## 6. Out of scope

- NIC network security group **Basic/Advanced**, Allow selected ports, VM delete options (later, once sourced).
- Plans for later missions (the data shape is ready for them).
