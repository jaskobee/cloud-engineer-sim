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
| L-ACTSCHEMA | Azure activity log event schema — https://learn.microsoft.com/en-us/azure/azure-monitor/platform/activity-log-schema |
| L-PLAN | Plan Azure virtual networks — https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-vnet-plan-design-arm |
| L-PRIVIP | Private IP addresses — https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/private-ip-addresses |
| L-NICADDR | Configure IP addresses for a network interface — https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/virtual-network-network-interface-addresses |
| L-RGPORTAL | Manage resource groups (portal) — https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/manage-resource-groups-portal |
| L-RGREST | Resource Groups - Create Or Update (REST) — https://learn.microsoft.com/en-us/rest/api/resources/resource-groups/create-or-update |
| L-RID | Resource functions for ARM templates (`resourceId`) — https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/template-functions-resource |
| L-RBACDEF | Understand Azure role definitions (action string format) — https://learn.microsoft.com/en-us/azure/role-based-access-control/role-definitions |
| L-REGIONS | List of Azure regions — https://learn.microsoft.com/en-us/azure/reliability/regions-list |
| L-NSGREST | Network Security Groups - Get (REST, `ProvisioningState` definition) — https://learn.microsoft.com/en-us/rest/api/virtualnetwork/network-security-groups/get |
| L-TPL-RULE | Template reference `Microsoft.Network/networkSecurityGroups/securityRules` (API 2025-09-01) — https://learn.microsoft.com/en-us/azure/templates/microsoft.network/networksecuritygroups/securityrules |
| L-TPL-VNET | Template reference `Microsoft.Network/virtualNetworks` (API 2025-09-01) — https://learn.microsoft.com/en-us/azure/templates/microsoft.network/virtualnetworks |
| L-TPL-NIC | Template reference `Microsoft.Network/networkInterfaces` (API 2025-09-01) — https://learn.microsoft.com/en-us/azure/templates/microsoft.network/networkinterfaces |
| L-TPL-PIP | Template reference `Microsoft.Network/publicIPAddresses` — https://learn.microsoft.com/en-us/azure/templates/microsoft.network/publicipaddresses |
| L-MOVE | Move Azure resources to a new resource group or subscription — https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/move-resource-group-and-subscription |
| L-VMSTATES | States and billing status of Azure Virtual Machines — https://learn.microsoft.com/en-us/azure/virtual-machines/states-billing |
| L-FINDIMG | Find Azure Marketplace VM images with the Azure CLI — https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage |
| L-DISKS | Azure managed disk types — https://learn.microsoft.com/en-us/azure/virtual-machines/disks-types |
| L-DISKSKU | `DiskStorageAccountTypes` (Azure SDK for JavaScript reference) — https://learn.microsoft.com/en-us/javascript/api/@azure/arm-compute/diskstorageaccounttypes |
| L-BSV2 | Bsv2 sizes series — https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/bsv2-series |
| L-TPL-VM | Template reference `Microsoft.Compute/virtualMachines` (API 2026-03-01) — https://learn.microsoft.com/en-us/azure/templates/microsoft.compute/virtualmachines |
| L-SSHKEY | `SshPublicKey` (Azure SDK for JavaScript reference) — https://learn.microsoft.com/en-us/javascript/api/@azure/arm-compute/sshpublickey |
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
| VNET-6 | "You can create a resource only in a virtual network that exists in the same region and subscription as the resource." Connecting VNets across subscriptions/regions is possible (peering, not modelled) | L-PLAN | VERIFIED |
| VNET-7 | ARM property names: `properties.addressSpace.addressPrefixes` ("A list of address blocks reserved for this virtual network in CIDR notation"), `properties.subnets`. Subnet: `addressPrefix`, `addressPrefixes`, `defaultOutboundAccess`, `networkSecurityGroup` | L-TPL-VNET | VERIFIED (names from the resource format) |
| VNET-8u | A VNet or subnet prefix that isn't on its network boundary (e.g. `10.0.1.5/24`), and overlapping blocks inside one VNet's address space | — | UNCERTAIN, refused as not modelled |
| VNET-9u | Changing an existing virtual network (address space, tags) | — | UNCERTAIN (VNET-4/VNET-4u), not modelled yet |

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
| SUB-8 | Each subnet has a unique address range in CIDR format within the VNet address space and can't overlap other subnets (restates SUB-3/SUB-4) | L-PLAN | VERIFIED |
| SUB-9s | Sim: subnets are child resources (`Microsoft.Network/virtualNetworks/subnets`) with their own ID and activity log entries. The VNet's `subnets` list is derived from them, never stored twice | — | SIM |

## NSG — Network security groups

| ID | Rule | Source | Status |
|---|---|---|---|
| NSG-1 | Rule priority is 100–4096. Lower numbers are processed first. Once traffic matches a rule, processing stops | L-NSG | VERIFIED |
| NSG-2 | Priority must be "unique for all security rules within the NSG" | L-NSGMAN | VERIFIED (wording) |
| NSG-2u | Whether uniqueness is per direction (inbound vs outbound) or across the whole NSG: the manage page says "within the NSG", the template reference says "unique for each rule in the collection". Neither mentions direction | L-NSGMAN, L-TPL-RULE | UNCERTAIN |
| NSG-2s | Sim: a second rule with the same priority **and the same direction** is refused (NSG-2). Same priority in the opposite direction is refused as not modelled (NSG-2u) | — | SIM |
| NSG-3 | Default inbound rules: AllowVNetInBound 65000, AllowAzureLoadBalancerInBound 65001, DenyAllInbound 65500. Default outbound rules: AllowVnetOutBound 65000, AllowInternetOutBound 65001, DenyAllOutBound 65500. Defaults have the lowest priority so custom rules always run first | L-NSG | VERIFIED (names as spelled on the overview page) |
| NSG-3u | Exact casing of default rule names as returned by the API/portal (the overview page mixes "VNet"/"Vnet", "Inbound"/"InBound") | L-NSG, L-ESR | UNCERTAIN, display the overview spelling until confirmed |
| NSG-3a | Default rule columns (priority · source · source ports · destination · destination ports · protocol · access). Inbound: AllowVNetInBound 65000 · VirtualNetwork · 0-65535 · VirtualNetwork · 0-65535 · Any · Allow; AllowAzureLoadBalancerInBound 65001 · AzureLoadBalancer · 0-65535 · 0.0.0.0/0 · 0-65535 · Any · Allow; DenyAllInbound 65500 · 0.0.0.0/0 · 0-65535 · 0.0.0.0/0 · 0-65535 · Any · Deny. Outbound: AllowVnetOutBound 65000 · VirtualNetwork · 0-65535 · VirtualNetwork · 0-65535 · Any · Allow; AllowInternetOutBound 65001 · 0.0.0.0/0 · 0-65535 · Internet · 0-65535 · Any · Allow; DenyAllOutBound 65500 · 0.0.0.0/0 · 0-65535 · 0.0.0.0/0 · 0-65535 · Any · Deny | L-NSG | VERIFIED |
| NSG-3s | Sim: default rules store protocol as `*` (the ARM value for any protocol, NSG-11) and the UI shows it as "Any" | — | SIM |
| NSG-4 | Rules are evaluated on the five-tuple (source, source port, destination, destination port, protocol). NSGs are **stateful**: a flow record is kept, return traffic doesn't need its own rule. Removing a rule that allowed a connection doesn't interrupt existing connections. **Rule changes only affect new connections** | L-NSG | VERIFIED |
| NSG-5 | `VirtualNetwork`, `AzureLoadBalancer` and `Internet` in source/destination are service tags | L-NSG | VERIFIED |
| NSG-6 | Rule settings: Source = Any / IP Addresses / My IP address / Service Tag / Application security group. Ports = single (`80`), range (`1024-65535`), comma list (`80, 1024-65535`) or `*`. Protocol = Any / TCP / UDP / ICMP. Action = Allow / Deny. Name unique within the NSG, ≤ 80 chars, starts with a letter or number, ends with a letter, number or underscore, only letters/numbers/underscores/periods/hyphens. Description ≤ 140 chars | L-NSGMAN | VERIFIED (ASGs not modelled in slice) |
| NSG-7 | **Inbound:** subnet NSG rules are processed first, then NIC NSG rules. **Outbound:** NIC NSG first, then subnet NSG. Inbound traffic must be allowed by both when both exist ("the port must be open in both NSGs") | L-NSGHOW, L-ESR | VERIFIED |
| NSG-8 | A VM with a Standard public IP is secure by default: for internet traffic to flow in, an NSG must be associated with its subnet or NIC and allow it | L-NSGHOW, L-PIP | VERIFIED |
| NSG-8u | Traffic *between VMs in the same VNet* when neither subnet nor NIC has an NSG: the how-it-works page says "All network traffic is blocked through a subnet and network interface if they don't have a network security group associated", but its outbound example says traffic "flows freely" from a VM with no NSG. Learn is ambiguous | L-NSGHOW | UNCERTAIN. Slice missions always associate NSGs. Unassociated intra-VNet flows are reported as not modelled |
| NSG-9 | NSG name: scope resource group, 1–80 chars, same rules as VNET-5. Security rule name: scope NSG, 1–80 chars | L-NAMES | VERIFIED |
| NSG-10 | Region/subscription constraints on associating an NSG to a subnet or NIC, and NSG/rule count limits: not on the manage page or L-PLAN. Limits live on the subscription limits page (not yet extracted) | L-NSGMAN, L-PLAN | UNCERTAIN. Sim refuses associations across regions or subscriptions as not modelled |
| NSG-11 | Security rule properties: `access` Allow/Deny; `direction` Inbound/Outbound; `protocol` `*`, `Ah`, `Esp`, `Icmp`, `Tcp`, `Udp`; `priority` int 100–4096; `sourcePortRange`/`destinationPortRange` "Integer or range between 0 and 65535" or `*`; `sourceAddressPrefix`/`destinationAddressPrefix` "CIDR or … IP range", `*`, or the default tags `VirtualNetwork`, `AzureLoadBalancer`, `Internet`; plural `…Prefixes`/`…PortRanges` lists; `description` ≤ 140 chars | L-TPL-RULE | VERIFIED |
| NSG-11s | Sim: single prefix/port fields only. Plural lists, other service tags, application security groups and address ranges written as `a-b` are refused as not modelled | — | SIM |
| NSG-12 | Zero or one NSG per subnet; the same or a different NSG per subnet; an NSG can be associated to a NIC, to the subnet the NIC is in, or both. Associating to subnets is recommended over individual NICs | L-PLAN | VERIFIED |
| NSG-13s | Sim: security rules are child resources (`Microsoft.Network/networkSecurityGroups/securityRules`), created or updated with a PUT-style write and removed with a delete. Default rules (NSG-3) are created with the NSG and are read-only | — | SIM |

## PIP — Public IP addresses

| ID | Rule | Source | Status |
|---|---|---|---|
| PIP-1 | Standard SKU: "secure by default model and be closed to inbound traffic when used as a frontend". Allowing traffic with an NSG is required | L-PIP | VERIFIED |
| PIP-2 | Basic SKU public IPs were retired on 2025-09-30 | L-PIP | VERIFIED |
| PIP-2s | Sim: only Standard SKU exists | — | SIM |
| PIP-3 | Name: scope resource group, 1–80 chars, same rules as VNET-5 | L-NAMES | VERIFIED |
| PIP-4 | Associating a Standard public IP to a VM's NIC is an explicit outbound method (NAT gateway is the recommended method for most scenarios) | L-OUTBOUND | VERIFIED |
| PIP-5u | Allocation method for Standard SKU (static only?). The VM network overview says "By default, public IP addresses are dynamic", which looks outdated for Standard | L-VMNET | UNCERTAIN, sim shows Standard as static and labels it until confirmed |
| PIP-6 | Template values: `sku.name` Basic / Standard / StandardV2; `sku.tier` Global / Regional; `publicIPAllocationMethod` Dynamic / Static; `publicIPAddressVersion` IPv4 / IPv6; `dnsSettings.domainNameLabel` + the regional DNS zone form the FQDN; `ipAddress` is the assigned address | L-TPL-PIP | VERIFIED |
| PIP-6s | Sim: Standard, Regional, Static, IPv4 only. Basic is refused (PIP-2). Other values are refused as not modelled | — | SIM |
| PIP-7s | Sim: assigned public addresses come from 198.51.100.0/24 (a documentation-only range, RFC 5737) and are labelled as made up | — | SIM |
| PIP-8 | "You may assign a public IP address to an IP configuration, but aren't required to." A Standard public IP on a NIC needs an NSG that explicitly allows the traffic | L-NICADDR | VERIFIED |
| PIP-9u | Associating one public IP to more than one IP configuration, or across regions/subscriptions | L-NICADDR | UNCERTAIN, refused as not modelled |

## NIC — Network interfaces

| ID | Rule | Source | Status |
|---|---|---|---|
| NIC-1 | Each NIC attached to a VM must be in the same location and subscription as the VM. Each NIC must connect to a virtual network in the same location and subscription as the NIC | L-VMNET | VERIFIED |
| NIC-2 | All NICs attached to a Resource Manager VM must be connected to a virtual network | L-VNETFAQ | VERIFIED |
| NIC-3 | Creating a VM in the portal automatically creates one NIC | L-VMNET | VERIFIED |
| NIC-4 | By default the portal assigns a dynamic private IP to a NIC when creating a VM | L-VMNET | VERIFIED |
| NIC-5 | The VM network overview says the portal creates an NSG named `<vm>-nsg` associated to the NIC, with one inbound rule (priority 1000, RDP, TCP 3389, Allow). The Linux quickstart instead shows "Public inbound ports → Allow selected ports → SSH (22), HTTP (80)" | L-VMNET, L-VMQS | UNCERTAIN: the NIC NSG's existence is stated, but its default rule set differs between pages (Windows-oriented text). Confirm the current VM-wizard networking options before modelling the wizard |
| NIC-6 | Name: scope resource group, 1–80 chars, same rules as VNET-5 | L-NAMES | VERIFIED |
| NIC-7 | ARM property names: `properties.networkSecurityGroup`, `properties.ipConfigurations[]` with `primary`, `privateIPAddress`, `privateIPAddressVersion`, `privateIPAllocationMethod`, `publicIPAddress`, `subnet` | L-TPL-NIC | VERIFIED (names from the resource format) |
| NIC-8s | Sim: one IPv4 IP configuration per NIC, named `ipconfig1` by the sim. Changing an existing NIC's subnet or private address isn't modelled yet. Its NSG and public IP can be changed | — | SIM |
| PRIV-1 | Dynamic is the default allocation method. Azure assigns "the next available unassigned or unreserved IP address in the subnet's address range … normally the next sequentially available address, there's no guarantee" | L-PRIVIP | VERIFIED |
| PRIV-1s | Sim: dynamic allocation takes the lowest free, unreserved address | — | SIM |
| PRIV-2 | Static allocation: "select and assign any unassigned or unreserved IP address in the subnet's address range." The 5 reserved addresses can't be assigned (SUB-2) | L-PRIVIP | VERIFIED |
| PRIV-3 | A dynamic address is released when the NIC is deleted, moved to another subnet in the same VNet, or changed to static with a different address | L-PRIVIP | VERIFIED |

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
| VM-1s | Sim: VM names use the VM-1 character list literally (no periods or underscores at all, no trailing hyphen), which is stricter than its note about Linux names not *ending* with a period. The portal uses the same value for resource name and host name (L-NAMES note), so the sim does too | — | SIM |
| VM-7 | Power states: Creating, Starting, Running ("the standard working state"), Stopping, Stopped (allocated, still billed), Deallocating, Deallocated (released the hardware, compute not billed). The instance view shows e.g. `PowerState/running` | L-VMSTATES | VERIFIED |
| VM-8 | Provisioning states describe the last control-plane operation and are separate from power state: Creating, Updating, Failed, Succeeded, Deleting, Migrating | L-VMSTATES | VERIFIED |
| VM-9 | ARM property names: `hardwareProfile.vmSize`; `storageProfile.imageReference` (`publisher`, `offer`, `sku`, `version`); `storageProfile.osDisk` (`createOption` Attach/Copy/Empty/FromImage/Restore, `osType` Linux/Windows, `managedDisk.storageAccountType`, `deleteOption` Delete/Detach); `osProfile` (`computerName`, `adminUsername`, `linuxConfiguration.disablePasswordAuthentication`, `linuxConfiguration.ssh.publicKeys[]` with `path` and `keyData`); `networkProfile.networkInterfaces[]` (`id`, `properties.primary`, `properties.deleteOption`) | L-TPL-VM | VERIFIED |
| VM-10 | Disk SKUs: Standard_LRS = Standard HDD, StandardSSD_LRS = Standard SSD, Premium_LRS = Premium SSD, PremiumV2_LRS = Premium SSD v2, UltraSSD_LRS = Ultra SSD, plus Premium_ZRS and StandardSSD_ZRS (zone-redundant) | L-DISKSKU | VERIFIED |
| VM-11 | Ultra Disks and Premium SSD v2 can't be used as OS disks. Premium SSD, Standard SSD and Standard HDD can. "On September 8, 2028, the ability to use Standard HDDs as OS disks will be retired." | L-DISKS | VERIFIED |
| VM-11s | Sim: OS disk SKUs offered are Premium_LRS, StandardSSD_LRS and Standard_LRS. ZRS SKUs aren't modelled (no availability zones yet) | — | SIM |
| VM-12 | Ubuntu 22.04 image: publisher `Canonical`, offer `0001-com-ubuntu-server-jammy`, SKU `22_04-lts-gen2`, version `latest`, URN alias `Ubuntu2204` (sample `az vm image list` output) | L-FINDIMG | VERIFIED |
| VM-12s | Sim: Ubuntu 22.04 (VM-12) is the only image offered. Ubuntu 24.04 isn't, because no Learn page found so far shows its URN | — | SIM |
| VM-13 | Bsv2 (burstable, CPU credit model): Standard_B2ts_v2 2 vCPUs / 1 GiB, Standard_B2ls_v2 2 vCPUs / 4 GiB, Standard_B2s_v2 2 vCPUs / 8 GiB | L-BSV2 | VERIFIED |
| VM-13s | Sim: these three sizes are offered in every sim region. Per-region size availability and quotas aren't modelled | — | SIM |
| VM-14 | Managed disk name (`Microsoft.Compute/disks`): scope resource group, 1–80 chars, alphanumerics, underscores and hyphens | L-NAMES | VERIFIED |
| VM-15s | Sim: creating a VM from an image also creates its managed OS disk as a `Microsoft.Compute/disks` resource named `<vm>_OsDisk_1` (made-up default). Only the VM write appears in the activity log; whether Azure logs a separate disk write isn't modelled | — | SIM |
| VM-16s | Sim: a VM is created with one existing NIC as its primary NIC, SSH key authentication only (VM-3s; the key pair is simulated, never a real key), and is Running as soon as the write succeeds (ARM-1s, VM-7) | — | SIM |
| VM-17u | Creating a VM with a NIC that's already attached to another VM | — | UNCERTAIN, refused as not modelled |
| VM-18 | SSH public key: `path` is "the full path on the created VM where ssh public key is stored … Example: /home/user/.ssh/authorized_keys". `keyData` is the public key ("at least 2048-bit and in ssh-rsa format") | L-SSHKEY | VERIFIED |

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
| MON-7u | Exact `operationName` for NSG *security rule* writes. Resolved 2026-10-08 by ARM-3s: composed from the documented format, not seen verbatim in an activity log sample | L-ACTSCHEMA | RESOLVED → ARM-3s |
| MON-8 | Administrative category: "If the operation type is Write, Delete, or Action, the records of both the start and success or fail of that operation are recorded" | L-ACTSCHEMA | VERIFIED |
| MON-9 | Event fields (Administrative): `caller` (email address, UPN claim or SPN claim of who performed the operation), `category` (always `Administrative`), `correlationId` (usually a GUID; events sharing it belong to the same "uber action"), `operationId` (GUID shared among the events of a single operation), `eventDataId` (unique per event), `operationName` (e.g. `Microsoft.Network/networkSecurityGroups/write`), `resourceId`, `resourceGroupName`, `resourceProviderName`, `resourceType`, `status`, `subStatus` (usually the HTTP status code), `eventTimestamp`, `submissionTimestamp`, `subscriptionId`, `level`. The schema "isn't strictly enforced across all data sources" | L-ACTSCHEMA | VERIFIED |
| MON-10 | Common `status` values: Started, In Progress, Succeeded, Failed, Active, Resolved | L-ACTSCHEMA | VERIFIED |
| MON-10s | Sim: every write records a `Started` event and then a `Succeeded` or `Failed` event with the same `operationId` and `correlationId`. A write the control plane refuses is `Started` + `Failed`. Until the deployment engine (step 6), accepted writes complete at the same sim instant | — | SIM |
| MON-11u | Whether portal "Review + create" validation (a dry run) appears in the activity log | — | UNCERTAIN. Sim doesn't log dry runs |
| MON-12u | `level` and `subStatus` values for failed or refused writes (the sample event only shows `Informational`) | L-ACTSCHEMA | UNCERTAIN. Sim doesn't model `level` or `subStatus` yet |
| MON-13s | Sim: activity log entries older than 90 sim days are dropped (MON-7 retention) | — | SIM |

## NAME — Other naming rules

| ID | Rule | Source | Status |
|---|---|---|---|
| NAME-1 | Resource group: scope subscription, 1–90 chars. Underscores, hyphens, periods, parentheses, letters or digits (Unicode letter/digit categories). Can't end with a period | L-NAMES | VERIFIED |
| NAME-2 | Log Analytics workspace: scope resource group, 4–63 chars, alphanumerics and hyphens, starts and ends with an alphanumeric | L-NAMES | VERIFIED |
| NAME-3 | Application Insights component: scope resource group, 1–260 chars, can't use `%&\?/` or control characters, can't end with a space or period | L-NAMES | VERIFIED |
| NAME-4 | Metric alert: scope resource group, 1–260 chars, can't use `*#&+:<>?@%{}\/\|` or control characters, can't end with a space or period | L-NAMES | VERIFIED |
| NAME-5u | Availability test (`webtests`) naming rule | L-NAMES | UNCERTAIN, not found in the extracted part of the page |
| NAME-6 | "Resource and resource group names are case-insensitive unless specifically noted … Always perform a case-insensitive comparison of names." | L-NAMES | VERIFIED |
| NAME-7 | "The name must be unique within a scope, which might vary for each resource type." Example: a virtual network name must be unique within a resource group | L-PLAN | VERIFIED |
| NAME-7s | Sim: the uniqueness scope is the **Scope** column of L-NAMES (resource group for VNets, NSGs, NICs and public IPs; subscription for resource groups; the parent resource for subnets and security rules). L-NAMES doesn't define the column itself; L-PLAN confirms the VNet case | — | SIM |
| NAME-8 | Resource group name (REST): 1–90 chars, pattern `^[-\w\._\(\)]+$`, "alphanumeric, underscore, parentheses, hyphen, period (except at end), and Unicode characters that match the allowed characters" | L-RGREST | VERIFIED |

## ARM — Resource Manager behaviour

| ID | Rule | Source | Status |
|---|---|---|---|
| ARM-1u | The set of `provisioningState` values. Resolved 2026-10-08 for Microsoft.Network by ARM-1 | — | RESOLVED → ARM-1 |
| ARM-1 | Microsoft.Network `ProvisioningState` values: Failed, Succeeded, Canceled, Creating, Updating, Deleting. Sample responses show `Succeeded` | L-NSGREST | VERIFIED |
| ARM-1s | Sim: until the deployment engine (step 6), accepted writes are `Succeeded` immediately. Compute's provisioning states are VM-8; Insights' are checked when those types arrive | — | SIM |
| ARM-2 | Resource ID formats. Resource group: `/subscriptions/{subscriptionId}/resourceGroups/{name}` (REST sample). Resource: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/{resourceProviderNamespace}/{resourceType}/{resourceName}`. Child resources append `/{childType}/{childName}` after the parent's name (`Microsoft.Compute/virtualMachines/myVM/extensions/myExt`) | L-RID, L-RGREST | VERIFIED |
| ARM-2s | Sim: the world keys resources by the lower-cased ID (NAME-6) and keeps the original casing in `id` | — | SIM |
| ARM-3 | RBAC action strings have the format `{Company}.{ProviderName}/{resourceType}/{action}`. `write` = PUT or PATCH, `delete` = DELETE, `action` = POST | L-RBACDEF | VERIFIED |
| ARM-3s | Sim: a write's activity log `operationName` is `{resourceType}/write` (or `/delete`), e.g. `Microsoft.Network/networkSecurityGroups/securityRules/write`. This matches the schema sample `Microsoft.Network/networkSecurityGroups/write` (MON-9) | — | SIM |
| RG-1 | A resource group's location is where its metadata is stored. "Resources inside a resource group can be in different regions." | L-RGPORTAL | VERIFIED |
| RG-2u | Updating an existing resource group (e.g. a different location in a second PUT) | — | UNCERTAIN, not modelled |
| RG-3 | The action for writing a resource group is `Microsoft.Resources/subscriptions/resourceGroups/write` (required at the destination of a move). Sim: it's the resource group write's activity log `operationName` (ARM-3s) | L-MOVE | VERIFIED |
| ARM-4u | A second PUT that changes an existing NSG's, public IP's or VM's settings (location, tags, SKU, size) | — | UNCERTAIN, not modelled yet |
| REG-1 | Regions offered by the sim: West Europe `westeurope` (Netherlands), North Europe `northeurope` (Ireland), Germany West Central `germanywestcentral` (Frankfurt). Each has 3 availability zones | L-REGIONS | VERIFIED (other regions not modelled) |

## FUTURE — Facts kept for later missions

| ID | Rule | Source | Status |
|---|---|---|---|
| ACA-1 | With an external workload-profiles Container Apps environment, inbound internet traffic goes through the public endpoint, not the virtual network. Locking it down with an NSG or firewall isn't supported. Never teach "subnet NSG blocked the players" on such an environment | L-ACA-NSG | VERIFIED |

---

## Drift log

| Date | Change |
|---|---|
| 2026-10-08 | Register created for the PixelForge VM slice |
| 2026-10-08 | Added L-ACTSCHEMA and MON-8 to MON-13s (activity log events) for the engine core (step 2). Narrowed MON-7u |
| 2026-10-08 | Step 4 research: added L-PLAN, L-PRIVIP, L-NICADDR, L-RGPORTAL, L-RGREST, L-RID, L-RBACDEF, L-REGIONS, L-NSGREST and template references. New VNET-6..9u, SUB-8, SUB-9s, NSG-2s, NSG-11..13s, PIP-6..9u, NIC-7, NIC-8s, PRIV-1..3, NAME-6..8, ARM-1..3s, RG-1, RG-2u, REG-1. Resolved ARM-1u and MON-7u. NSG-2u narrowed (still open) |
| 2026-10-09 | Step 4c research (VMs): L-VMSTATES, L-FINDIMG, L-DISKS, L-DISKSKU, L-BSV2, L-TPL-VM. New VM-1s, VM-7..VM-17u. ARM-4u widened to VMs |
