import { invalid, type CommandHandler } from '../commands.ts'
import type { World } from '../world.ts'
import { armKey, resourceGroupId } from './armId.ts'
import { checkRegion, firstRefusal, getResourceGroup, missing, notModelled } from './common.ts'
import { checkResourceGroupName } from './names.ts'

/**
 * Scenario setup: a subscription the client already has. Missions provide subscriptions;
 * the player never creates one, so this is not an Azure write and leaves no activity log entry.
 */
export const addSubscription: CommandHandler<{ subscriptionId: string; displayName: string }> = {
  type: 'scenario/addSubscription',
  write: () => null,
  validate(world, { payload }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.subscriptionId)) {
      return invalid('scenario/bad-subscription-id', 'A subscription ID is a GUID.')
    }
    if (world.tenant.subscriptions[payload.subscriptionId]) return invalid('scenario/duplicate-subscription', 'That subscription already exists.')
    if (payload.displayName.trim() === '') return invalid('scenario/missing-name', 'A subscription needs a display name.')
    return null
  },
  apply: (world, { payload }): World => ({
    ...world,
    tenant: {
      ...world.tenant,
      subscriptions: { ...world.tenant.subscriptions, [payload.subscriptionId]: { ...payload } },
    },
  }),
}

export interface ResourceGroupWrite {
  subscriptionId: string
  name: string
  location: string
  tags?: Record<string, string>
}

/** Create a resource group. Its location is where its metadata lives (RG-1). */
export const writeResourceGroup: CommandHandler<ResourceGroupWrite> = {
  type: 'arm/resourceGroups/write',
  write: ({ payload }) => ({
    operationName: 'Microsoft.Resources/subscriptions/resourceGroups/write', // RG-3
    resourceId: resourceGroupId(payload.subscriptionId, payload.name),
    subscriptionId: payload.subscriptionId,
    resourceGroupName: payload.name,
  }),
  validate: (world, { payload }) =>
    firstRefusal(
      () => (world.tenant.subscriptions[payload.subscriptionId] ? null : missing(`Subscription '${payload.subscriptionId}'`)),
      () => checkResourceGroupName(payload.name),
      () => checkRegion(payload.location),
      () =>
        getResourceGroup(world, resourceGroupId(payload.subscriptionId, payload.name))
          ? notModelled('RG-2u', `Resource group '${payload.name}' already exists. Changing an existing resource group isn't modelled yet.`)
          : null,
    ),
  apply(world, { payload }) {
    const id = resourceGroupId(payload.subscriptionId, payload.name)
    return {
      ...world,
      tenant: {
        ...world.tenant,
        resourceGroups: {
          ...world.tenant.resourceGroups,
          [armKey(id)]: { id, name: payload.name, location: payload.location, tags: { ...(payload.tags ?? {}) } },
        },
      },
    }
  },
}
