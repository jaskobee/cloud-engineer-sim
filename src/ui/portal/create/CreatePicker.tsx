import { useGame } from '../../gameContext.ts'
import { RESOURCE_KINDS } from '../../resourceKinds.ts'
import { CHILD_KINDS } from '../route.ts'

/** "Create a resource" (PORTAL-2): what the simulator can create. Child resources are added on their parent's page. */
export function CreatePicker() {
  const startCreate = useGame(s => s.startCreate)
  const kinds = RESOURCE_KINDS.filter(k => !CHILD_KINDS.includes(k.kind))
  return (
    <>
      <ul className="all-services">
        {kinds.map(k => (
          <li key={k.kind}>
            <button type="button" className="all-services-item is-plain" onClick={() => startCreate({ kind: k.kind })} data-guide={`picker:${k.kind}`}>
              <span className="all-services-name">{k.label}</span>
              <span className="all-services-blurb">{k.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="form-section-hint picker-note">
        Subnets are added on their virtual network (Subnets), security rules on their network security group (Inbound or Outbound
        security rules), and availability tests on Application Insights (Availability).
      </p>
    </>
  )
}
