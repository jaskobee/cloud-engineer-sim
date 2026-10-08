# AZURE_FACTS — sourced rule register

The simulator enforces **only** what is written here. Every rule cites the official Microsoft Learn page it comes from, so anyone can check it.

## How to use this file

- **Before implementing Azure behaviour**, find its rule here. If it's missing, research it on Microsoft Learn, add it, then implement it.
- **Code and tests cite rule IDs** (e.g. a refusal returns `ruleId: 'SUB-3'`, and the test asserts that ID).
- **Status**
  - `VERIFIED`: the statement is on the cited Learn page (checked on the date in the source table).
  - `UNCERTAIN`: Learn is vague, contradictory or silent. **Don't implement it as stated.** Refuse the case as *not modelled*, or label a simplification in-game, and record what's needed to resolve it.
  - `SIM`: how the simulator applies a VERIFIED rule, including labelled simplifications.
- **When Learn changes**, update the rule, the date and the drift log at the bottom.
- Exam outlines and product UI change. Re-check a rule whenever you touch the code that enforces it.

## Sources (Microsoft Learn unless noted, checked 2026-10-08)

| Key | Page |
|---|---|
| L-NSGHOW | How network security groups filter network traffic — https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works |
| L-NSG | Network security groups overview — https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview |
| L-NSGMAN | Create, change, or delete a network security group — https://learn.microsoft.com/en-us/azure/virtual-network/manage-network-security-group |
| L-VNETFAQ | Azure Virtual Network FAQ — https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq |
| L-OUTBOUND | Default outbound access — https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access |
| L-PIP | Public IP addresses — https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/public-ip-addresses |
| L-VMNET | Virtual networks and virtual machines in Azure — https://learn.microsoft.com/en-us/azure/virtual-machines/network-overview |
| L-VMQS | Quickstart: Create a Linux VM in the Azure portal — https://learn.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal |
| L-VMFAQ | Linux VM FAQ — https://learn.microsoft.com/en-us/azure/virtual-machines/linux/faq |
| L-NAMES | Naming rules and restrictions for Azure resources — https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules |
| L-IPFV | IP flow verify overview — https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview |
| L-ESR | Diagnose a VM network traffic filter problem (effective security rules) — https://learn.microsoft.com/en-us/azure/virtual-network/diagnose-network-traffic-filter-problem |
| L-AVAIL | Application Insights availability tests — https://learn.microsoft.com/en-us/azure/azure-monitor/app/availability |
| L-VMMETRICS | Supported metrics for Microsoft.Compute/virtualMachines — https://learn.microsoft.com/en-us/azure/azure-monitor/reference/supported-metrics/microsoft-compute-virtualmachines-metrics |
| L-ACTLOG | Azure Monitor activity log — https://learn.microsoft.com/en-us/azure/azure-monitor/platform/activity-log |
| L-ACA-NSG | Container Apps: securing a virtual network with NSGs (future) — https://learn.microsoft.com/en-us/azure/container-apps/firewall-integration |

---

## VNET — Virtual networks

| ID | Rule | Source | Status |
|---|---|---|---|
| VNET-1 | A virtual network is limited to a single region. It spans availability zones. Cross-region connectivity uses peering | L-VNETFAQ | VERIFIED |
| VNET-2 | Recommended address ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC 1918), and 100.64.0.0/10 (RFC 6598, treated as private in Azure). "Other address spaces … might work but have undesirable side effects." | L-VNETFAQ | VERIFIED |
| VNET-2s | Sim: accept the four ranges above. Other ranges are refused as *not modelled* (we don't simulate the side effects) | — | SIM |
| VNET-3 | These ranges can't be added: 224.0.0.0/4 (multicast), 255.255.255.255/32 (broadcast), 127.0.0.0/8 (loopback), 169.254.0.0/16 (link-local), 168.63.129.16/32 (internal DNS) | L-VNETFAQ | VERIFIED |
| VNET-4 | You can add, remove and modify the CIDR blocks a virtual network uses | L-VNETFAQ | VERIFIED |
| VNET-4u | What happens when removing an address block that subnets still use: not stated on the FAQ | L-VNETFAQ | UNCERTAIN, refuse as not modelled |
| VNET-5 | Name: scope resource group, 2–64 chars, alphanumerics, underscores, periods, hyphens. Starts with an alphanumeric, ends with an alphanumeric or underscore | L-NAMES | VERIFIED |

## SUB — Subnets

| ID | Rule | Source | Status |
|---|---|---|---|
| SUB-1 | Smallest supported IPv4 subnet is /29, largest is /2 (as written on the FAQ). IPv6 subnets must be exactly /64 | L-VNETFAQ | VERIFIED (IPv6 not modelled) |
| SUB-2 | Azure reserves the first four addresses and the last address of every subnet (5 total). Example for 192.168.1.0/24: .0 network, .1 default gateway, .2 and .3 Azure DNS mapping, .255 broadcast | L-VNETFAQ | VERIFIED |
| SUB-3 | Subnet address spaces can't overlap one another | L-VNETFAQ | VERIFIED |
| SUB-4 | A subnet can be added if its range isn't part of another subnet and the virtual network's address range has space for it (the subnet must lie inside the VNet address space) | L-VNETFAQ | VERIFIED |
| SUB-5 | A subnet can be added, removed, expanded or shrunk only if no VMs or services are deployed in it | L-VNETFAQ | VERIFIED |
| SUB-6 | Name: scope virtual network, 1–80 chars, same character rules as VNET-5 | L-NAMES | VERIFIED |
| SUB-7 | For API versions released after 2026-03-31, new virtual networks default to private subnets (`defaultOutboundAccess` = false). The portal already defaults to private subnets | L-OUTBOUND | VERIFIED |
| SUB-7s | Sim: every subnet is private. A VM reaches the internet outbound only through an explicit method. In the slice that's a Standard public IP on its NIC (PIP-4) | — | SIM |

## NSG — Network security groups

| ID | Rule | Source | Status |
|---|---|---|---|
| NSG-1 | Rule priority is 100–4096. Lower numbers are processed first. Once traffic matches a rule, processing stops | L-NSG | VERIFIED |
| NSG-2 | Priority must be "unique for all security rules within the NSG" | L-NSGMAN | VERIFIED (wording) |
| NSG-2u | Whether uniqueness is per direction (inbound vs outbound) or across the whole NSG: the manage page says "within the NSG" and doesn't mention direction | L-NSGMAN | UNCERTAIN, resolve before implementing |
| NSG-3 | Default inbound rules: AllowVNetInBound 65000, AllowAzureLoadBalancerInBound 65001, DenyAllInbound 65500. Default outbound rules: AllowVnetOutBound 65000, AllowInternetOutBound 65001, DenyAllOutBound 65500. Defaults have the lowest priority so custom rules always run first | L-NSG | VERIFIED (names as spelled on the overview page) |
| NSG-3u | Exact casing of default rule names as returned by the API/portal (the overview page mixes "VNet"/"Vnet", "Inbound"/"InBound") | L-NSG, L-ESR | UNCERTAIN, display the overview spelling until confirmed |
| NSG-4 | Rules are evaluated on the five-tuple (source, source port, destination, destination port, protocol). NSGs are **stateful**: a flow record is kept, return traffic doesn't need its own rule. Removing a rule that allowed a connection doesn't interrupt existing connections. **Rule changes only affect new connections** | L-NSG | VERIFIED |
| NSG-5 | `VirtualNetwork`, `AzureLoadBalancer` and `Internet` in source/destination are service tags | L-NSG | VERIFIED |
| NSG-6 | Rule settings: Source = Any / IP Addresses / My IP address / Service Tag / Application security group. Ports = single (`80`), range (`1024-65535`), comma list (`80, 1024-65535`) or `*`. Protocol = Any / TCP / UDP / ICMP. Action = Allow / Deny. Name unique within the NSG, ≤ 80 chars, starts with a letter or number, ends with a letter, number or underscore, only letters/numbers/underscores/periods/hyphens. Description ≤ 140 chars | L-NSGMAN | VERIFIED (ASGs not modelled in slice) |
| NSG-7 | **Inbound:** subnet NSG rules are processed first, then NIC NSG rules. **Outbound:** NIC NSG first, then subnet NSG. Inbound traffic must be allowed by both when both exist ("the port must be open in both NSGs") | L-NSGHOW, L-ESR | VERIFIED |
| NSG-8 | A VM with a Standard public IP is secure by default: for internet traffic to flow in, an NSG must be associated with its subnet or NIC and allow it | L-NSGHOW, L-PIP | VERIFIED |
| NSG-8u | Traffic *between VMs in the same VNet* when neither subnet nor NIC has an NSG: the how-it-works page says "All network traffic is blocked through a subnet and network interface if they don't have a network security group associated", but its outbound example says traffic "flows freely" from a VM with no NSG. Learn is ambiguous | L-NSGHOW | UNCERTAIN. Slice missions always associate NSGs. Unassociated intra-VNet flows are reported as not modelled |
| NSG-9 | NSG name: scope resource group, 1–80 chars, same rules as VNET-5. Security rule name: scope NSG, 1–80 chars | L-NAMES | VERIFIED |
| NSG-10 | Region/subscription constraints on associating an NSG to a subnet or NIC, and NSG/rule count limits: not on the manage page. Limits live on the subscription limits page (not yet extracted) | L-NSGMAN | UNCERTAIN, not modelled |

## PIP — Public IP addresses

| ID | Rule | Source | Status |
|---|---|---|---|
| PIP-1 | Standard SKU: "secure by default model and be closed to inbound traffic when used as a frontend". Allowing traffic with an NSG is required | L-PIP | VERIFIED |
| PIP-2 | Basic SKU public IPs were retired on 2025-09-30 | L-PIP | VERIFIED |
| PIP-2s | Sim: only Standard SKU exists | — | SIM |
| PIP-3 | Name: scope resource group, 1–80 chars, same rules as VNET-5 | L-NAMES | VERIFIED |
| PIP-4 | Associating a Standard public IP to a VM's NIC is an explicit outbound method (NAT gateway is the recommended method for most scenarios) | L-OUTBOUND | VERIFIED |
| PIP-5u | Allocation method for Standard SKU (static only?). The VM network overview says "By default, public IP addresses are dynamic", which looks outdated for Standard | L-VMNET | UNCERTAIN, sim shows Standard as static and labels it until confirmed |

## NIC — Network interfaces

| ID | Rule | Source | Status |
|---|---|---|---|
| NIC-1 | Each NIC attached to a VM must be in the same location and subscription as the VM. Each NIC must connect to a virtual network in the same location and subscription as the NIC | L-VMNET | VERIFIED |
| NIC-2 | All NICs attached to a Resource Manager VM must be connected to a virtual network | L-VNETFAQ | VERIFIED |
| NIC-3 | Creating a VM in the portal automatically creates one NIC | L-VMNET | VERIFIED |
| NIC-4 | By default the portal assigns a dynamic private IP to a NIC when creating a VM | L-VMNET | VERIFIED |
| NIC-5 | The VM network overview says the portal creates an NSG named `<vm>-nsg` associated to the NIC, with one inbound rule (priority 1000, RDP, TCP 3389, Allow). The Linux quickstart instead shows "Public inbound ports → Allow selected ports → SSH (22), HTTP (80)" | L-VMNET, L-VMQS | UNCERTAIN: the NIC NSG's existence is stated, but its default rule set differs between pages (Windows-oriented text). Confirm the current VM-wizard networking options before modelling the wizard |
| NIC-6 | Name: scope resource group, 1–80 chars, same rules as VNET-5 | L-NAMES | VERIFIED |

## VM — Virtual machines

| ID | Rule | Source | Status |
|---|---|---|---|
| VM-1 | Name: scope resource group. Linux 1–64, Windows 1–15 (host name; resource name up to 64). Can't use spaces, control characters or `` ~ ! @ # $ % ^ & * ( ) = + _ [ ] { } \ \| ; : . ' " , < > / ? ``. Linux names can't end with a period or hyphen. Windows names can't include periods or end with a hyphen | L-NAMES | VERIFIED |
| VM-2 | Linux admin username: 1–32 chars. Disallowed: `1, 123, a, actuser, adm, admin, admin1, admin2, administrator, aspnet, backup, console, david, guest, john, owner, root, server, sql, support_388945a0, support, sys, test, test1, test2, test3, user, user1, user2, user3, user4, user5, video` | L-VMFAQ | VERIFIED |
| VM-3 | Password length depends on the tool (portal 12–72, PowerShell 8–123, CLI 12–123, ARM templates 12–72) and needs 3 of 4: lowercase, uppercase, digit, special character. Some common passwords are disallowed | L-VMFAQ | VERIFIED |
| VM-3s | Sim: the slice uses **SSH public key** authentication only (L-VMQS: "Generate new key pair"). No real or realistic credentials are ever entered | — | SIM |
| VM-4 | Portal Linux VM: authentication type "SSH public key", key source "Generate new key pair". Inbound port rules "Public inbound ports → Allow selected ports" | L-VMQS | VERIFIED |
| VM-5 | Effective security rules are only shown when the VM is running and an NSG is associated with its NIC or subnet | L-ESR | VERIFIED |
| VM-6s | Sim: the game API and PostgreSQL are modelled as services with health on the VM, not a simulated guest OS (labelled in-game) | — | SIM |

## NW — Network Watcher diagnostics

| ID | Rule | Source | Status |
|---|---|---|---|
| NW-1 | IP flow verify checks whether a packet is allowed or denied to or from a VM based on security and admin rules. Inputs: direction, protocol, local IP, remote IP, local port, remote port. Output: **Access allowed** or **Access denied**, the name of the deciding rule, and the NSG (with a link, except when a default rule decided) | L-IPFV | VERIFIED |
| NW-2 | IP flow verify tests only TCP and UDP (ICMP needs NSG diagnostics). It evaluates NSGs on both the subnet and the NIC | L-IPFV | VERIFIED |
| NW-3 | IP flow verify needs a Network Watcher instance in the VM's subscription and region | L-IPFV | VERIFIED |
| NW-3u | Whether Network Watcher is enabled automatically per region | — | UNCERTAIN, sim assumes enabled and labels it |
| NW-4 | Effective security rules = aggregation of the NIC NSG and subnet NSG rules. The portal shows separate tabs per NSG. CLI/PowerShell show `NetworkSecurityGroup`, `Association` (NetworkInterface/Subnet) and rules prefixed `defaultSecurityRules/` or `securityRules/`. CLI: `az network nic list-effective-nsg` | L-ESR | VERIFIED |

## MON — Monitoring

| ID | Rule | Source | Status |
|---|---|---|---|
| MON-1 | Standard availability test: sends a single request, validates the endpoint responds, measures performance. Can check TLS/SSL certificate validity, HTTP verb, headers | L-AVAIL | VERIFIED |
| MON-2 | Test locations: recommended minimum five, up to 16. Default frequency 5 minutes, so with five locations the site is tested on average every minute | L-AVAIL | VERIFIED |
| MON-3 | URL ping tests are deprecated. Retirement extended to 2028-09-30. Use standard tests | L-AVAIL | VERIFIED |
| MON-4 | Availability alerts are enabled automatically when a test is created (email when unavailable and when available again; in-portal unless action groups are configured). Custom alert rules use Metrics as the signal type with **Availability** selected | L-AVAIL | VERIFIED |
| MON-5u | Application Insights resources must be workspace-based (backed by a Log Analytics workspace) | — | UNCERTAIN, find and cite the Learn page before modelling the dependency |
| MON-6 | VM platform metrics (REST name = display name): `Percentage CPU` (Percent, Average), `Network In Total` (Bytes, Total), `Network Out Total` (Bytes, Total), `Available Memory Bytes` (Bytes, Average), `Available Memory Percentage` (Percent, Average), `VmAvailabilityMetric` (Count) | L-VMMETRICS | VERIFIED |
| MON-7 | The activity log records control-plane (management) operations: create, update, delete and actions, e.g. creating a VM. It doesn't typically capture reads. Events are kept 90 days. Subscription scope is the default. Portal filters include Operation, Event initiated by, Event category (e.g. Administrative) | L-ACTLOG | VERIFIED |
| MON-7u | Exact operation names/display strings shown for NSG rule writes (e.g. `Microsoft.Network/networkSecurityGroups/securityRules/write`) | L-ACTLOG | UNCERTAIN, find the event schema page and cite it |

## NAME — Other naming rules

| ID | Rule | Source | Status |
|---|---|---|---|
| NAME-1 | Resource group: scope subscription, 1–90 chars. Underscores, hyphens, periods, parentheses, letters or digits (Unicode letter/digit categories). Can't end with a period | L-NAMES | VERIFIED |
| NAME-2 | Log Analytics workspace: scope resource group, 4–63 chars, alphanumerics and hyphens, starts and ends with an alphanumeric | L-NAMES | VERIFIED |
| NAME-3 | Application Insights component: scope resource group, 1–260 chars, can't use `%&\?/` or control characters, can't end with a space or period | L-NAMES | VERIFIED |
| NAME-4 | Metric alert: scope resource group, 1–260 chars, can't use `*#&+:<>?@%{}\/\|` or control characters, can't end with a space or period | L-NAMES | VERIFIED |
| NAME-5u | Availability test (`webtests`) naming rule | L-NAMES | UNCERTAIN, not found in the extracted part of the page |

## ARM — Resource Manager behaviour

| ID | Rule | Source | Status |
|---|---|---|---|
| ARM-1u | The set of `provisioningState` values the sim shows (Creating, Updating, Deleting, Succeeded, Failed …) | — | UNCERTAIN, find and cite before step 6 (deployment engine) |

## FUTURE — Facts kept for later missions

| ID | Rule | Source | Status |
|---|---|---|---|
| ACA-1 | With an external workload-profiles Container Apps environment, inbound internet traffic goes through the public endpoint, not the virtual network. Locking it down with an NSG or firewall isn't supported. Never teach "subnet NSG blocked the players" on such an environment | L-ACA-NSG | VERIFIED |

---

## Drift log

| Date | Change |
|---|---|
| 2026-10-08 | Register created for the PixelForge VM slice |
