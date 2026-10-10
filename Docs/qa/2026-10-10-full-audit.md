# Azure QA: first full audit (2026-10-10)

**Run by:** the `azure-qa` agent (`.claude/agents/azure-qa.md`), in four parallel slices:
- network basics: VNET, SUB, NAME, REG, RG, PRIV, ARM;
- NSG, NW, PIP, NIC;
- VM, MON, RUN;
- player-facing text.

**Method:** every verdict rests on a Learn page fetched during the audit, quoted verbatim.

**Scope:** all of `Docs/AZURE_FACTS.md`, `src/engine/azure/`, the deployment engine, mission data, INFO topics and UI copy.

**Result: 0 BLOCKER, 5 MAJOR, 26 MINOR.**
- Nothing in the game contradicts Learn badly enough to teach a wrong exam answer outright.
- The five MAJOR findings are claims that are stronger than Learn, or Azure behaviour the register doesn't back.
- All other enforced rules were confirmed with quotes; the agents' "Verified" lists covered 120+ rules.

Status: **open**. Nothing has been fixed yet (paused during Jasko's playtest).

## MAJOR

| # | Finding | Where | Learn evidence | Fix |
|---|---|---|---|---|
| M1 | Application Insights, availability tests and alert rules show `Creating` while deploying. Learn lists `Deploying` for components and web tests. Metric alert writes are a synchronous 200 with no `provisioningState`. ARM-1s still says Insights "are checked when those types arrive". | `commands.ts:140`, `provisioning.ts:19-21`, ARM-1s | [Components – Create Or Update](https://learn.microsoft.com/en-us/rest/api/application-insights/components/create-or-update): "Values will include Succeeded, Deploying, Canceled, and Failed." The same text is on [Web Tests](https://learn.microsoft.com/en-us/rest/api/application-insights/web-tests/create-or-update). [Metric Alerts](https://learn.microsoft.com/en-us/rest/api/monitor/metric-alerts/create-or-update): no provisioningState, 200 only | Add rules for these. Make alert rules synchronous. Make components and web tests synchronous, or show `Deploying` (SIM). Update ARM-1s and MON-29s |
| M2 | PIP-5u is out of date: Learn now says Standard public IPs are **Static only**. The game behaves correctly, but its refusal tells players that "Learn is unclear". | `networkInterfaces.ts:43-45`, PIP-5u | [Public IP addresses](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/public-ip-addresses) (2025-11-18), SKU table: "Standard (v1 or v2): Static" | Replace PIP-5u with a VERIFIED rule from L-PIP. Refuse Dynamic with `rule(...)`. Update the test |
| M3 | Monitoring refusals present sim limits as Azure rules: status code 100–599 (MON-19), failed locations ≥ 1 (MON-22), and the URL shape (a query string without a path is refused). Learn says "The URL can include a query string." | `monitoring.ts:202-203, 216-217, 303` | [Availability tests](https://learn.microsoft.com/en-us/azure/azure-monitor/app/availability): "The URL can include a query string." The [metricAlerts template](https://learn.microsoft.com/en-us/azure/templates/microsoft.insights/metricalerts) gives failedLocationCount as int with no range | Turn these into `notModelled` under MON-25s / MON-28s. Accept `?query` without a path |
| M4 | The review item "No rule repeats DenyAllInbound" flags any Deny from `*` or `0.0.0.0/0`. A custom deny-all at priority ≤ 4096 runs **before** AllowVNetInBound and AllowAzureLoadBalancerInBound, so it isn't a copy. Valid answers to `db-only-game` fail the review, and the review then teaches something wrong. | `pixelforge-launch-day.ts:256-275` | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview): defaults 65000/65001/65500; "default security rules are given the lowest priority … to ensure your custom rules are always processed first" | Count only source `Internet` (with port `*`) as redundant. Add a test that a Deny `*` → `*` on the DB NSG passes |
| M5 | "Without a public IP the internet can't reach it at all" is presented as Azure fact. A public load balancer, Application Gateway, Firewall DNAT or Bastion can also reach a VM. This is the sim's PIP-10s rule, but the text cites PIP-10 and has no simplification label. The `db-private` hint says the same. | `pixelforge-launch-day.ts:74, 263` | [Public IP addresses](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/public-ip-addresses): public IPs attach to "Virtual machine network interfaces", "Azure Load Balancers (public)", "Application Gateways", "Azure Firewalls", "Bastion Hosts"… | Say "…and with no load balancer, gateway or firewall in front of it (none in this mission)…", and cite PIP-10s |

## MINOR

**Rules and register**
1. NSG-2 should cite the NSG overview's sentence "You can't create two security rules with the same priority and direction." Rewrite NSG-2u to quote all three pages and say they conflict. Change the refusal to "once per direction".
2. NSG-3u can be resolved. The REST API and the effective-rules doc spell the default rules `AllowVnetInBound`, `DenyAllInBound`, `AllowVnetOutBound`, `DenyAllOutBound` (the overview uses different casing). Store the API casing where the game shows ARM data (`defaultSecurityRules/…`).
3. VM-2: Learn disagrees on Linux admin username length (the FAQ says 1–32; the arm-compute OSProfile says up to 64). The game also makes the reserved names case-insensitive, which no page states. Record the conflict and refuse 33–64 as not modelled.
4. Stale or wrong source titles:
   - L-TPL-VNET says API 2025-09-01, but 2025-07-01 is the latest listed.
   - The subnet property names should cite the `virtualnetworks/subnets` template page.
   - L-TPL-VM is now 2026-04-01.
   - Check L-TPL-RULE and L-TPL-NIC.
5. NSG-12 should add L-NSGHOW's "avoid associating network security groups with both a subnet and its network interfaces at the same time", and the "applies to all resources in the subnet" quote.
6. MON-24: say that three consecutive checks applies to metric alerts (availability alerts are metric alerts). MON-2: add Learn's reason for five locations ("distinguish problems in your website from network issues").
7. OS disk `deleteOption: 'Delete'` has no rule behind it, and the ARM default is `Detach`. Record it as a sim choice or use Detach before VM deletion arrives.

**Player-facing text**

8. INFO subnet: "so the first VM gets .4" → ".4 is the first address a VM can get". Dynamic allocation is "normally the next" free address, which isn't guaranteed (PRIV-1).
9. The VNET-6 refusal names the region even when only the subscription differs.
10. The rule form offers ESP and AH; the portal offers Any/TCP/UDP/ICMP (NSG-6). Remove them or mark them "template/API only".
11. The "Usually * : clients pick random source ports" hint has no source. Drop it or label it as general networking advice.
12. Bsv2 hint: "earn credits while idle" → "earn credits below their base CPU performance and spend them above it" (L-BSV2).
13. "PerGB2018 (pay per GB ingested)" has no rule. Add one from [Log Analytics cost](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/cost-logs) ("pay-as-you-go model … based on ingested data volume and data retention").
14. Alert form: don't recommend "locations − 2" when there are fewer than five locations (MON-23 assumes ≥ 5).
15. Inspector: "resolves after three checks without failures" → "once the condition isn't met for three consecutive checks" (MON-24).
16. "(alert rules are global)" → "(the simulator creates alert rules as global)". `global` only appears in Learn's samples (MON-22, MON-28s).
17. AllowVNetInBound is described as traffic "from inside the virtual network". The VirtualNetwork tag also covers peered and connected networks (NSG-15). Fix in info.ts and the mission hints.
18. NSG placement: use Learn's reason ("simplify management of security rules"), and add the "avoid both" tip.
19. INFO sentences that go beyond their rules: activity-log advice, "a database needs no public IP", "Application monitoring in Azure Monitor", "connecting regions **takes** peering" (should be **can use** peering), and "rules apply to everything in the subnet" (needs the L-NSGHOW quote).

**SIM labels the register promises but the UI doesn't show**

20. The availability results table doesn't say its durations and messages are made up (MON-26s).
21. IP flow verify with no NSG at all shows "Access denied" with no simulator label (NW-7s). Network Watcher has no "assumed enabled" note (NW-3u). Canvas wording: "no network security group is associated", not "no NSG allows".
22. The availability test frequency and timeout options are sim choices (MON-25s), but the form doesn't label them.

**Tests that should assert their rule ID**

23. PIP-1, NSG-5, NSG-14, NSG-15 (basis), NW-1 (`isDefaultRule`), NW-4, NW-7s.
24. VM-15s (OS disk name taken) and MON-5s (workspace in another subscription).

**Gameplay text accuracy**

25. The `db-only-game` fail detail always blames AllowVNetInBound. Name the deciding rule from the evaluator instead.
26. MON-20 (`ApplicationInsightsAvailability` service tag) never reaches the player. Add an INFO "In this simulator" line, since it's AZ-104 relevant.

## Notes (no change required)
- **SUB-4:** a subnet spanning two adjacent address blocks is refused with "isn't inside the address space". Learn is silent on this case.
- **SUB-5:** the rule triggers on NICs; Learn says "VMs or services".
- **VNET-3:** also refuses blocks that contain a forbidden range.
- **Address overlap:** simulated player addresses can coincide with simulated public IPs (198.51.100.x). Consider 198.51.100.128/25 for players.
- **Activity log:** not-modelled refusals are logged as `Failed` operations (disclosed as MON-10s).
- **NSG-8u:** Learn's how-it-works page says outbound "flows freely" with no NSG. Mention this in the uncertainty note; outbound also depends on SUB-7.
- **WebFetch limits:** it can't reach the property tables on very long ARM template pages (over 100k characters). The child-resource pages (e.g. `virtualnetworks/subnets`) are reliable alternatives.
