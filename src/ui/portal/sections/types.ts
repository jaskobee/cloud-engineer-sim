import type { ReactNode } from 'react'
import type { Resource, ResourceGroup, World } from '../../../engine/index.ts'

/** What every section gets: the resource (or resource group) and the world it lives in. */
export interface SectionProps {
  target: Resource | ResourceGroup
  world: World
}

/** A section of a resource page: its command bar and its content. */
export interface SectionDef {
  Commands?: (props: SectionProps) => ReactNode
  Body: (props: SectionProps) => ReactNode
}

export const asResource = (t: Resource | ResourceGroup): Resource => t as Resource
